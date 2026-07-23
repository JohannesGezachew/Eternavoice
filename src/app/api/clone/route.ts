import { NextResponse } from "next/server";
import { z } from "zod";
import { elevenlabs } from "@/lib/elevenlabs";
import { checkRate } from "@/lib/rateLimit";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

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
  "audio/wave",
  "audio/x-wav",
  "audio/vnd.wave",
  "audio/ogg",
  "audio/aac",
  "audio/x-m4a",
  "video/mp4",
  "video/quicktime",
  "video/webm",
];

export async function POST(request: Request) {
  const limit = await checkRate({ scope: "clone", windowMs: 10 * 60 * 1000, max: 4 });
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Please wait a moment before creating another voice." },
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

    // Persist to DB if the request is authenticated
    let subjectId: string | undefined;
    try {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        // Upsert: if a subject with this voice_id already exists (re-clone), update it
        const { data: existing } = await supabase
          .from("subjects")
          .select("id")
          .eq("user_id", user.id)
          .eq("voice_id", result.voiceId)
          .maybeSingle();

        if (existing) {
          subjectId = existing.id as string;
          await supabase
            .from("subjects")
            .update({ name, voice_name: labelledName, updated_at: new Date().toISOString() })
            .eq("id", subjectId);
        } else {
          const { data: inserted } = await supabase
            .from("subjects")
            .insert({
              user_id: user.id,
              name,
              voice_id: result.voiceId,
              voice_name: labelledName,
              persona: { mode: "persona", name },
            })
            .select("id")
            .single();
          subjectId = inserted?.id as string | undefined;
        }
      }
    } catch {
      // Non-fatal — unauthenticated users continue with localStorage only
    }

    return NextResponse.json({
      voiceId: result.voiceId,
      name,
      subjectId,
      requiresVerification: result.requiresVerification,
    });
  } catch (err) {
    const raw = errorDetails(err);
    const lower = raw.toLowerCase();

    console.error("[clone] voice provider failed:", raw);

    if (
      lower.includes("paid_plan_required") ||
      lower.includes("can_not_use_instant_voice_cloning") ||
      lower.includes("payment_required")
    ) {
      return NextResponse.json(
        {
          error:
            "Voice recreation is not enabled for the current workspace. Contact support, then try again.",
        },
        { status: 402 },
      );
    }

    if (lower.includes("voice_limit_reached") || lower.includes("max_voices")) {
      return NextResponse.json(
        {
          error:
            "Your hosted voice library is full. Delete an old voice and try again.",
        },
        { status: 409 },
      );
    }

    if (lower.includes("rate_limit") || lower.includes("too_many_requests")) {
      return NextResponse.json(
        { error: "Voice creation is temporarily busy. Wait a moment and try again." },
        { status: 429 },
      );
    }

    if (
      lower.includes("no_speech") ||
      lower.includes("no voice") ||
      lower.includes("voice_not_found") ||
      lower.includes("audio_quality") ||
      lower.includes("too_short") ||
      lower.includes("invalid_file")
    ) {
      return NextResponse.json(
        {
          error:
            "We could not find enough clear speech in that clip. Pick a clean 30–60 second section with one speaker and try again.",
        },
        { status: 422 },
      );
    }

    return NextResponse.json(
      {
        error:
          "Voice recreation failed. Please try again in a moment. If it keeps failing, the recording may need to be cleaner or longer.",
      },
      { status: 502 },
    );
  }
}

function errorDetails(err: unknown): string {
  if (!(err instanceof Error)) return String(err);

  const parts = [err.message];
  const withBody = err as Error & { statusCode?: number; body?: unknown };

  if (withBody.statusCode) parts.push(`status=${withBody.statusCode}`);
  if (withBody.body) parts.push(`body=${JSON.stringify(withBody.body)}`);

  return parts.filter(Boolean).join("\n");
}
