import { NextResponse } from "next/server";
import { z } from "zod";
import { elevenlabs, VOICE_SETTINGS } from "@/lib/elevenlabs";
import { env } from "@/lib/env";
import { assertVoiceOwner } from "@/lib/db/voiceOwnership";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const Body = z.object({
  voiceId: z.string().min(8).max(64),
  text: z.string().min(1).max(4000),
});

/**
 * Synthesize one block of text in a voice the caller owns, returned as a single
 * mp3. Used to replay (or re-save) a past reply whose original audio was never
 * persisted — we keep only the text, and regenerate the voice on demand.
 */
export async function POST(request: Request) {
  let parsed: z.infer<typeof Body>;
  try {
    parsed = Body.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }

  const owner = await assertVoiceOwner(parsed.voiceId);
  if (!owner.ok) {
    return NextResponse.json(
      { error: owner.status === 401 ? "Unauthorized" : "That voice isn't yours." },
      { status: owner.status },
    );
  }

  try {
    const audioStream = await elevenlabs().textToSpeech.stream(parsed.voiceId, {
      text: parsed.text,
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
    return new NextResponse(Buffer.from(merged) as unknown as BodyInit, {
      headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json(
      { error: "Could not generate the voice for that line." },
      { status: 502 },
    );
  }
}
