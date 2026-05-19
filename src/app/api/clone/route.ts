import { NextResponse } from "next/server";
import { z } from "zod";
import { elevenlabs } from "@/lib/elevenlabs";
import { checkRate } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const maxDuration = 300;

const NameSchema = z
  .string()
  .trim()
  .min(1, "A name helps us label the voice.")
  .max(80, "That name is a bit long.");

const MAX_BYTES = 150 * 1024 * 1024;
const MIN_BYTES = 50 * 1024;

const SUPPORTED_TYPES = [
  "audio/webm",
  "audio/mp4",
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/ogg",
  "audio/aac",
  "audio/x-m4a",
  "video/mp4",
  "video/quicktime",
];

export async function POST(request: Request) {
  const limit = await checkRate({ scope: "clone", windowMs: 10 * 60 * 1000, max: 4 });
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Please wait a moment before cloning another voice." },
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
  const rawName = form.get("name");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No audio attached." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "That file is larger than we accept (150 MB). Try a shorter clip — 2–5 minutes is ideal." },
      { status: 413 },
    );
  }
  if (file.size < MIN_BYTES) {
    return NextResponse.json(
      { error: "The recording is very short. Please try again." },
      { status: 400 },
    );
  }
  if (file.type && !SUPPORTED_TYPES.some((t) => file.type.startsWith(t))) {
    return NextResponse.json(
      { error: "We could not read that audio format." },
      { status: 415 },
    );
  }

  const parsedName = NameSchema.safeParse(typeof rawName === "string" ? rawName : "");
  const name = parsedName.success ? parsedName.data : "EternaVoice subject";

  const labelledName = `${name} · EV ${new Date().toISOString().slice(0, 10)}`;

  try {
    const client = elevenlabs();
    const result = await client.voices.ivc.create({
      name: labelledName.slice(0, 100),
      files: [file],
      removeBackgroundNoise: false,
      description: "Created via EternaVoice demo",
      labels: { source: "eternavoice-demo-v1" },
    });

    return NextResponse.json({
      voiceId: result.voiceId,
      name,
      requiresVerification: result.requiresVerification,
    });
  } catch (err) {
    const raw = err instanceof Error ? err.message : "";
    const lower = raw.toLowerCase();

    if (
      lower.includes("paid_plan_required") ||
      lower.includes("can_not_use_instant_voice_cloning") ||
      lower.includes("payment_required")
    ) {
      return NextResponse.json(
        {
          error:
            "Instant Voice Cloning isn’t included on the current ElevenLabs plan. Upgrade to Creator (or higher) at elevenlabs.io/app/subscription, then try again — the same API key will work.",
        },
        { status: 402 },
      );
    }

    if (lower.includes("voice_limit_reached") || lower.includes("max_voices")) {
      return NextResponse.json(
        {
          error:
            "Your ElevenLabs voice library is full. Delete an old voice in the ElevenLabs dashboard and try again.",
        },
        { status: 409 },
      );
    }

    if (lower.includes("rate_limit") || lower.includes("too_many_requests")) {
      return NextResponse.json(
        { error: "ElevenLabs is rate-limiting. Wait a moment and try again." },
        { status: 429 },
      );
    }

    return NextResponse.json(
      {
        error:
          "Voice cloning failed. Please try again in a moment. If it keeps failing, the recording may need to be cleaner or longer.",
      },
      { status: 502 },
    );
  }
}
