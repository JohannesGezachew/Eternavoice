import { NextResponse } from "next/server";
import { openai } from "@/lib/openai";
import { env } from "@/lib/env";
import { checkRate } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_BYTES = 12 * 1024 * 1024;

export async function POST(request: Request) {
  const limit = await checkRate({ scope: "transcribe", windowMs: 60 * 60 * 1000, max: 240 });
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many transcriptions in this session." },
      { status: 429 },
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid upload." }, { status: 400 });
  }

  const file = form.get("audio");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No audio attached." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Recording too large." }, { status: 413 });
  }

  try {
    const transcription = await openai().audio.transcriptions.create({
      file,
      model: env.OPENAI_TRANSCRIBE_MODEL,
      response_format: "json",
      // Pin to English. Without this, Whisper auto-detects the language and
      // frequently mis-detects short / accented / noisy English audio as
      // another language, which then makes the persona reply in that language.
      language: "en",
    });
    const text =
      typeof transcription === "object" && transcription && "text" in transcription
        ? String((transcription as { text?: string }).text ?? "")
        : "";
    return NextResponse.json({ text: text.trim() });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not transcribe that recording.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
