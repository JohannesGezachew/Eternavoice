import { NextResponse } from "next/server";
import { z } from "zod";
import { openai } from "@/lib/openai";
import { elevenlabs, VOICE_SETTINGS } from "@/lib/elevenlabs";
import { env } from "@/lib/env";
import { buildChatPrompt } from "@/lib/prompts";
import { SentenceBuffer } from "@/lib/sentences";
import { encodeSse, type ChatEvent } from "@/lib/sse";
import { checkRate } from "@/lib/rateLimit";
import { createClient } from "@/lib/supabase/server";
import { deriveUserKey, decryptField } from "@/lib/crypto";

export const runtime = "nodejs";
// Vercel Hobby caps function duration at 60s; replies typically finish in 5–20s.
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const MODEL_CONTEXT_TURNS = 12;
const MEMORY_CONTEXT_LIMIT = 10;

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
  memories: z
    .array(
      z.object({
        content: z.string().min(1).max(500),
      }),
    )
    .max(20)
    .optional(),
  subjectId: z.string().uuid().optional(),
  /** First-ever conversation with this person: the persona gathers memory
   *  by asking to be reminded of the shared life. */
  firstMeeting: z.boolean().optional(),
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

  // Continuity context lives server-side: session summaries plus the stored
  // memories for this person. Merging DB memories here means the prompt never
  // depends on the client's local store being fresh — facts extracted from a
  // previous conversation reach the very next one, on any device.
  let sessionSummaries: Array<{ summary: string; createdAt: string }> = [];
  const memoryPool: string[] = (parsed.memories ?? []).map((m) => m.content.trim()).filter(Boolean);
  if (parsed.subjectId) {
    try {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const key = deriveUserKey(user.id);
        const { data } = await supabase
          .from("session_summaries")
          .select("summary_enc, created_at")
          .eq("user_id", user.id)
          .eq("subject_id", parsed.subjectId)
          .order("created_at", { ascending: false })
          .limit(3);
        sessionSummaries = (data ?? []).map((row) => ({
          summary: (() => {
            try { return decryptField(row.summary_enc as string, key); } catch { return ""; }
          })(),
          createdAt: row.created_at as string,
        })).filter((s) => s.summary);

        const { data: memRows } = await supabase
          .from("memories")
          .select("content_enc")
          .eq("user_id", user.id)
          .eq("subject_id", parsed.subjectId)
          .is("deleted_at", null)
          .order("updated_at", { ascending: false })
          .limit(MEMORY_CONTEXT_LIMIT);
        for (const row of memRows ?? []) {
          try {
            const content = decryptField(row.content_enc as string, key).trim();
            if (content && !memoryPool.some((m) => m.toLowerCase() === content.toLowerCase())) {
              memoryPool.push(content);
            }
          } catch {
            // undecryptable row — skip
          }
        }
      }
    } catch {
      // Non-fatal — continue without server context
    }
  }

  // A real UUID — this becomes the assistant turn's id in the client store
  // and, from there, a uuid primary key in the turns table.
  const turnId = crypto.randomUUID();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const startedAt = Date.now();
      const send = (event: ChatEvent) => {
        try {
          controller.enqueue(encodeSse(event));
        } catch {
          // controller already closed
        }
      };
      const sendTiming = (label: string) => {
        send({ type: "timing", turnId, label, elapsedMs: Date.now() - startedAt });
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
      let firstTextSent = false;
      let firstTtsStarted = false;
      let firstAudioSent = false;
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
              if (!firstAudioSent) {
                firstAudioSent = true;
                sendTiming("server_first_audio_sent");
              }
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
          if (!firstTtsStarted) {
            firstTtsStarted = true;
            sendTiming("server_first_tts_started");
          }
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
      sendTiming("server_stream_ready");
      void drain();

      const systemPrompt = buildChatPrompt(
        parsed.persona,
        memoryPool.slice(0, 12).map((content) => ({ content })),
        sessionSummaries,
        Boolean(parsed.firstMeeting),
      );
      const sentences = new SentenceBuffer();
      let rawText = "";
      let fullText = "";
      let sentenceCount = 0;

      const enqueueSentence = (sentence: string) => {
        const polished = humanizeSentence(sentence, parsed.persona, Boolean(parsed.firstMeeting));
        if (!polished) return;
        const index = sentenceCount++;
        fullText = `${fullText}${fullText ? " " : ""}${polished}`.trim();
        if (!firstTextSent) {
          firstTextSent = true;
          sendTiming("server_first_text_sent");
        }
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
          max_tokens: parsed.firstMeeting
            ? 110 // room for a reaction plus the remembering question
            : parsed.persona.speechStyle?.talkativeness &&
                parsed.persona.speechStyle.talkativeness >= 7
              ? 130
              : 75,
          messages: [
            { role: "system", content: systemPrompt },
            ...parsed.messages
              .slice(-MODEL_CONTEXT_TURNS)
              .map((m) => ({ role: m.role, content: m.content })),
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

function humanizeSentence(
  sentence: string,
  persona: z.infer<typeof Body>["persona"],
  firstMeeting = false,
): string {
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

  // The anti-interrogation filter flattens trailing questions — but during
  // the first-meeting interview, questions ARE the conversation.
  const questionCount = (next.match(/\?/g) ?? []).length;
  if (!firstMeeting && (calibration?.tooManyQuestions || questionCount > 0) && next.endsWith("?")) {
    next = next.replace(/\?+$/, ".");
  }

  if (Math.random() < fillerChance(persona)) {
    next = `${pickFiller(persona)} ${next.charAt(0).toLowerCase()}${next.slice(1)}`;
  }

  return next.trim();
}

function naturalPauseMs(text: string): number {
  const base = text.includes("...") || text.includes("—") ? 180 : 120;
  const emotional = /\b(miss|sorry|love|gone|died|death|alone|afraid|hurt)\b/i.test(text) ? 260 : 0;
  return Math.min(650, base + emotional + Math.floor(Math.random() * 120));
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
