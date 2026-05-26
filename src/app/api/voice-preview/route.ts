import { NextResponse } from "next/server";
import { z } from "zod";
import { elevenlabs, VOICE_SETTINGS } from "@/lib/elevenlabs";
import { env } from "@/lib/env";
import { checkRate } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const Body = z.object({
  voiceId: z.string().min(8).max(64),
  name: z.string().max(120).optional(),
});

export async function POST(request: Request) {
  const limit = await checkRate({ scope: "voice-preview", windowMs: 10 * 60 * 1000, max: 20 });
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Please wait a moment before previewing again." },
      { status: 429 },
    );
  }

  let parsed: z.infer<typeof Body>;
  try {
    parsed = Body.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }

  try {
    const label = parsed.name?.trim() || "this voice";
    const audioStream = await elevenlabs().textToSpeech.stream(parsed.voiceId, {
      text: `This is a short preview of ${label}. If it sounds right, you can continue. If not, you can make a better clone.`,
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

    const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
    const merged = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.byteLength;
    }

    return new NextResponse(Buffer.from(merged) as unknown as BodyInit, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("[voice-preview] failed:", err);
    return NextResponse.json(
      { error: "Could not generate a preview for this voice." },
      { status: 502 },
    );
  }
}
