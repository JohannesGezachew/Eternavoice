import { NextResponse } from "next/server";
import { z } from "zod";
import { openai } from "@/lib/openai";
import { elevenlabs, VOICE_SETTINGS } from "@/lib/elevenlabs";
import { env } from "@/lib/env";
import { buildSystemPrompt } from "@/lib/prompts";
import { SentenceBuffer } from "@/lib/sentences";
import { encodeSse, type ChatEvent } from "@/lib/sse";
import { checkRate } from "@/lib/rateLimit";

export const runtime = "nodejs";
// Vercel Hobby caps function duration at 60s; replies typically finish in 5–20s.
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const Body = z.object({
  voiceId: z.string().min(8).max(64),
  persona: z.object({
    mode: z.enum(["self", "persona"]),
    name: z.string().max(120).default(""),
    relationship: z.string().max(160).optional(),
    description: z.string().max(2000).optional(),
    catchphrases: z.string().max(500).optional(),
    avoidPhrases: z.string().max(500).optional(),
    speechStyle: z
      .object({
        warmth: z.number().min(1).max(10),
        directness: z.number().min(1).max(10),
        expressiveness: z.number().min(1).max(10),
        humor: z.number().min(1).max(10),
        talkativeness: z.number().min(1).max(10),
      })
      .optional(),
    calibration: z
      .object({
        tooFormal: z.boolean().optional(),
        tooCheerful: z.boolean().optional(),
        tooManyQuestions: z.boolean().optional(),
        tooLong: z.boolean().optional(),
        notWarmEnough: z.boolean().optional(),
      })
      .optional(),
  }),
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(4000),
      }),
    )
    .min(1)
    .max(40),
});

export async function POST(request: Request) {
  const limit = await checkRate({ scope: "chat", windowMs: 60 * 60 * 1000, max: 60 });
  if (!limit.ok) {
    return NextResponse.json(
      { error: "You've reached this session's hourly conversation limit." },
      { status: 429 },
    );
  }

  let parsed: z.infer<typeof Body>;
  try {
    parsed = Body.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }

  const turnId = `t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: ChatEvent) => {
        try {
          controller.enqueue(encodeSse(event));
        } catch {
          // controller already closed
        }
      };

      const ttsQueue: Array<{
        index: number;
        pauseMs: number;
        promise: Promise<Buffer | null>;
      }> = [];
      let drainStarted = false;
      let llmDone = false;
      let audioChunksSent = 0;
      let ttsFailures = 0;
      let drainResolve: (() => void) | null = null;
      const drainComplete = new Promise<void>((resolve) => {
        drainResolve = resolve;
      });

      const drain = async () => {
        if (drainStarted) return;
        drainStarted = true;
        let nextIndex = 0;
        while (true) {
          const next = ttsQueue.find((e) => e.index === nextIndex);
          if (!next) {
            if (llmDone && ttsQueue.every((e) => e.index < nextIndex)) break;
            await new Promise((r) => setTimeout(r, 10));
            continue;
          }
          try {
            const audio = await next.promise;
            if (audio && audio.byteLength > 0) {
              audioChunksSent += 1;
              send({
                type: "audio",
                turnId,
                sentenceIndex: nextIndex,
                mime: "audio/mpeg",
                base64: audio.toString("base64"),
                pauseMs: next.pauseMs,
              });
            }
          } catch {
            ttsFailures += 1;
            // skip; other sentences continue
          } finally {
            nextIndex += 1;
          }
        }
        drainResolve?.();
      };

      const ttsForSentence = async (text: string): Promise<Buffer | null> => {
        try {
          const client = elevenlabs();
          const audioStream = await client.textToSpeech.stream(parsed.voiceId, {
            text,
            modelId: env.ELEVENLABS_TTS_MODEL,
            outputFormat: "mp3_44100_64",
            voiceSettings: VOICE_SETTINGS,
            optimizeStreamingLatency: 4,
          });
          const reader = (audioStream as ReadableStream<Uint8Array>).getReader();
          const chunks: Uint8Array[] = [];
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            if (value) chunks.push(value);
          }
          const total = chunks.reduce((s, c) => s + c.byteLength, 0);
          const merged = new Uint8Array(total);
          let offset = 0;
          for (const c of chunks) {
            merged.set(c, offset);
            offset += c.byteLength;
          }
          return Buffer.from(merged);
        } catch {
          ttsFailures += 1;
          return null;
        }
      };

      send({ type: "ready" });
      void drain();

      const systemPrompt = buildSystemPrompt(parsed.persona);
      const sentences = new SentenceBuffer();
      let rawText = "";
      let fullText = "";
      let sentenceCount = 0;

      const enqueueSentence = (sentence: string) => {
        const polished = humanizeSentence(sentence, parsed.persona);
        if (!polished) return;
        const index = sentenceCount++;
        fullText = `${fullText}${fullText ? " " : ""}${polished}`.trim();
        send({ type: "text", turnId, delta: `${polished} ` });
        ttsQueue.push({
          index,
          pauseMs: naturalPauseMs(polished),
          promise: ttsForSentence(polished),
        });
      };

      try {
        const response = await openai().chat.completions.create({
          model: env.OPENAI_CHAT_MODEL,
          stream: true,
          temperature: 0.75,
          max_tokens:
            parsed.persona.speechStyle?.talkativeness &&
            parsed.persona.speechStyle.talkativeness >= 7
              ? 150
              : 90,
          messages: [
            { role: "system", content: systemPrompt },
            ...parsed.messages.map((m) => ({ role: m.role, content: m.content })),
          ],
        });

        for await (const chunk of response) {
          const delta = chunk.choices[0]?.delta?.content ?? "";
          if (!delta) continue;
          rawText += delta;
          const ready = sentences.push(delta);
          for (const s of ready) enqueueSentence(s);
        }

        const tail = sentences.flush();
        if (tail) enqueueSentence(tail);
        if (!fullText && rawText.trim()) enqueueSentence(rawText.trim());

        llmDone = true;
        await drainComplete;
        if (fullText.trim() && sentenceCount > 0 && audioChunksSent === 0) {
          send({
            type: "notice",
            stage: "tts",
            message:
              "I could write the reply, but the voice audio failed for this turn.",
          });
        } else if (ttsFailures > 0) {
          send({
            type: "notice",
            stage: "tts",
            message: "Part of the voice audio failed, so the reply may sound incomplete.",
          });
        }
        send({ type: "done", turnId, full: fullText.trim() });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Could not generate a reply.";
        send({ type: "error", stage: "llm", message });
        llmDone = true;
      } finally {
        try {
          controller.close();
        } catch {
          // already closed
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

const GENERIC_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\bthank you for sharing that\b/gi, "I hear you"],
  [/\byour feelings are valid\b/gi, "that makes sense"],
  [/\bi'?m here to support you\b/gi, "I'm here"],
  [/\bthat sounds (really |so )?difficult\b/gi, "that's a lot"],
  [/\bi understand how you feel\b/gi, "I hear you"],
  [/\bas an ai\b/gi, ""],
];

function humanizeSentence(sentence: string, persona: z.infer<typeof Body>["persona"]): string {
  let next = sentence.replace(/\s+/g, " ").trim();
  if (!next) return "";

  for (const [pattern, replacement] of GENERIC_REPLACEMENTS) {
    next = next.replace(pattern, replacement);
  }

  for (const phrase of splitLines(persona.avoidPhrases)) {
    next = next.replace(new RegExp(escapeRegExp(phrase), "gi"), "").replace(/\s+/g, " ").trim();
  }

  next = next.replace(/!+/g, ".");

  const calibration = persona.calibration;
  const talkativeness = persona.speechStyle?.talkativeness ?? 3;
  const maxLength = calibration?.tooLong || talkativeness <= 4 ? 150 : 220;
  if (next.length > maxLength) {
    const cut = next.slice(0, maxLength);
    next = cut.slice(0, Math.max(cut.lastIndexOf(","), cut.lastIndexOf("."), cut.lastIndexOf(" "))).trim();
    if (next && !/[.?!…]$/.test(next)) next += "...";
  }

  const questionCount = (next.match(/\?/g) ?? []).length;
  if ((calibration?.tooManyQuestions || questionCount > 0) && next.endsWith("?")) {
    next = next.replace(/\?+$/, ".");
  }

  if (Math.random() < fillerChance(persona)) {
    next = `${pickFiller(persona)} ${next.charAt(0).toLowerCase()}${next.slice(1)}`;
  }

  return next.trim();
}

function naturalPauseMs(text: string): number {
  const base = text.includes("...") || text.includes("—") ? 520 : 260;
  const emotional = /\b(miss|sorry|love|gone|died|death|alone|afraid|hurt)\b/i.test(text) ? 420 : 0;
  return Math.min(1100, base + emotional + Math.floor(Math.random() * 220));
}

function fillerChance(persona: z.infer<typeof Body>["persona"]): number {
  const expressiveness = persona.speechStyle?.expressiveness ?? 4;
  return expressiveness >= 7 ? 0.16 : 0.08;
}

function pickFiller(persona: z.infer<typeof Body>["persona"]): string {
  const custom = splitLines(persona.catchphrases).filter((phrase) => phrase.length <= 24);
  const options = custom.length ? [...custom, "mm.", "yeah.", "right."] : ["mm.", "yeah.", "right.", "I know."];
  return options[Math.floor(Math.random() * options.length)] ?? "mm.";
}

function splitLines(value: string | undefined): string[] {
  return (value ?? "")
    .split(/\r?\n|,/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
