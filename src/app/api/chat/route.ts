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

      const ttsQueue: Array<{ index: number; promise: Promise<Buffer | null> }> = [];
      let drainStarted = false;
      let llmDone = false;
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
            await new Promise((r) => setTimeout(r, 25));
            continue;
          }
          try {
            const audio = await next.promise;
            if (audio && audio.byteLength > 0) {
              send({
                type: "audio",
                turnId,
                sentenceIndex: nextIndex,
                mime: "audio/mpeg",
                base64: audio.toString("base64"),
              });
            }
          } catch {
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
            optimizeStreamingLatency: 2,
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
          return null;
        }
      };

      send({ type: "ready" });
      void drain();

      const systemPrompt = buildSystemPrompt(parsed.persona);
      const sentences = new SentenceBuffer();
      let fullText = "";
      let sentenceCount = 0;

      const enqueueSentence = (sentence: string) => {
        const index = sentenceCount++;
        ttsQueue.push({ index, promise: ttsForSentence(sentence) });
      };

      try {
        const response = await openai().chat.completions.create({
          model: env.OPENAI_CHAT_MODEL,
          stream: true,
          temperature: 0.85,
          max_tokens: 480,
          messages: [
            { role: "system", content: systemPrompt },
            ...parsed.messages.map((m) => ({ role: m.role, content: m.content })),
          ],
        });

        for await (const chunk of response) {
          const delta = chunk.choices[0]?.delta?.content ?? "";
          if (!delta) continue;
          fullText += delta;
          send({ type: "text", turnId, delta });
          const ready = sentences.push(delta);
          for (const s of ready) enqueueSentence(s);
        }

        const tail = sentences.flush();
        if (tail) enqueueSentence(tail);

        llmDone = true;
        await drainComplete;
        send({ type: "done", turnId, full: fullText.trim() });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Could not generate a reply.";
        send({ type: "error", message });
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
