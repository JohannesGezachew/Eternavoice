import { NextResponse } from "next/server";
import { z } from "zod";
import { elevenlabs, VOICE_SETTINGS } from "@/lib/elevenlabs";
import { env } from "@/lib/env";
import { checkRate } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const Body = z.object({ voiceId: z.string().min(8).max(64) });

// Short, content-free acknowledgements that fit any turn. Pre-generated once
// per session and played instantly in the cloned voice the moment the user
// stops speaking — bridging the silence before the real reply audio arrives,
// the way a real person says "mm" while they gather a thought.
const PHRASES = ["Mm.", "Mmm.", "Hmm.", "Mm-hm.", "Let me think.", "Mm, okay."];

async function ttsBase64(voiceId: string, text: string): Promise<string | null> {
  try {
    const audioStream = await elevenlabs().textToSpeech.stream(voiceId, {
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
    return Buffer.from(merged).toString("base64");
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  // Non-critical feature — fail soft on rate limit rather than erroring.
  const limit = await checkRate({ scope: "backchannel", windowMs: 10 * 60 * 1000, max: 30 });
  if (!limit.ok) return NextResponse.json({ clips: [] });

  let parsed: z.infer<typeof Body>;
  try {
    parsed = Body.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }

  const results = await Promise.all(PHRASES.map((p) => ttsBase64(parsed.voiceId, p)));
  const clips = results.filter((b): b is string => Boolean(b));

  return NextResponse.json(
    { clips },
    { headers: { "Cache-Control": "no-store" } },
  );
}
