import { NextResponse } from "next/server";
import { z } from "zod";
import { elevenlabs, VOICE_SETTINGS } from "@/lib/elevenlabs";
import { env } from "@/lib/env";
import { checkRate, consumeAllowance } from "@/lib/rateLimit";
import { assertVoiceOwner } from "@/lib/db/voiceOwnership";
import { splitForReading, MAX_READING_CHARS } from "@/lib/readings";
import { encodeSse } from "@/lib/sse";
import type { ReadEvent } from "@/lib/sse";

export const runtime = "nodejs";
// A five-minute reading is forty-odd provider calls at four at a time.
export const maxDuration = 300;
export const dynamic = "force-dynamic";

const Body = z.object({
  voiceId: z.string().min(8).max(64),
  script: z.string().min(1).max(MAX_READING_CHARS),
});

/**
 * How many sentences are synthesized at once.
 *
 * Unlike a conversation, the whole script is known up front, so without a
 * ceiling a long reading would fire forty simultaneous provider requests and
 * be rate-limited into failure. Four stays comfortably ahead of playback —
 * the listener is always hearing sentence N while N+1..N+4 are being made.
 */
const CONCURRENCY = 4;

/**
 * Read a script aloud in a voice the caller owns.
 *
 * Shares the conversation route's shape — split, synthesize in parallel, drain
 * in order over SSE — and deliberately none of its language handling. No model
 * is involved: the text is spoken exactly as written, because it is the
 * user's own words and the entire point is that nothing rewrites them.
 */
export async function POST(request: Request) {
  let parsed: z.infer<typeof Body>;
  try {
    parsed = Body.parse(await request.json());
  } catch {
    return NextResponse.json(
      { error: `A reading has to be between 1 and ${MAX_READING_CHARS} characters.` },
      { status: 400 },
    );
  }

  const owner = await assertVoiceOwner(parsed.voiceId);
  if (!owner.ok) {
    return NextResponse.json(
      { error: owner.status === 401 ? "Unauthorized" : "That voice isn't yours." },
      { status: owner.status },
    );
  }

  const limit = await checkRate(
    { scope: "reading", windowMs: 60 * 60 * 1000, max: 20 },
    owner.userId,
  );
  if (!limit.ok) {
    return NextResponse.json(
      { error: "That's a lot of readings at once — give it a moment." },
      { status: 429 },
    );
  }

  const segments = splitForReading(parsed.script);
  if (!segments.length) {
    return NextResponse.json({ error: "There's nothing to read yet." }, { status: 400 });
  }

  // Charged once the request is committed to spending, as everywhere else.
  const allowance = await consumeAllowance("reading", owner.userId);
  if (!allowance.ok) {
    return NextResponse.json(
      { error: "monthly_allowance_reached", scope: "reading", resetsAt: allowance.resetsAt },
      { status: 429 },
    );
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: ReadEvent) => {
        try {
          controller.enqueue(encodeSse(event));
        } catch {
          // controller already closed
        }
      };

      // The client renders the whole script split the same way the voice will
      // speak it, so each line can be lit as it is heard.
      send({ type: "ready", segments: segments.map((s) => s.text) });

      const speak = async (text: string): Promise<Buffer | null> => {
        try {
          const audioStream = await elevenlabs().textToSpeech.stream(parsed.voiceId, {
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
          const total = chunks.reduce((sum, c) => sum + c.byteLength, 0);
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

      // Kick off a sliding window of syntheses, but emit strictly in order —
      // a reading heard out of sequence is not a reading.
      const pending = new Map<number, Promise<Buffer | null>>();
      let next = 0;
      let failures = 0;

      const fill = () => {
        while (pending.size < CONCURRENCY && next < segments.length) {
          const index = next++;
          pending.set(index, speak(segments[index]!.text));
        }
      };

      try {
        fill();
        for (let index = 0; index < segments.length; index++) {
          const inFlight = pending.get(index);
          if (!inFlight) break;
          const audio = await inFlight;
          pending.delete(index);
          fill();

          if (audio && audio.byteLength > 0) {
            send({
              type: "audio",
              index,
              mime: "audio/mpeg",
              base64: audio.toString("base64"),
              pauseMs: segments[index]!.pauseMs,
            });
          } else {
            failures++;
            // Told plainly rather than skipped in silence — a missing line in
            // something someone wrote is not a detail.
            send({ type: "notice", index, message: "This line couldn't be spoken." });
          }
        }

        if (failures === segments.length) {
          send({ type: "error", message: "The voice couldn't be reached. Try again in a moment." });
        }
        send({ type: "done" });
      } catch (err) {
        send({
          type: "error",
          message: err instanceof Error ? err.message : "The reading stopped unexpectedly.",
        });
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
