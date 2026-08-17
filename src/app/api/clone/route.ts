import { NextResponse } from "next/server";
import { z } from "zod";
import { elevenlabs } from "@/lib/elevenlabs";
import { checkRate, consumeAllowance } from "@/lib/rateLimit";
import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

/**
 * Service-role client for the columns that decide what a row may speak in.
 *
 * voice_id and voice_name are not writable by `authenticated` (migration 009),
 * because assertVoiceOwner grants access by asking which voice a subject
 * carries — so a user-writable voice_id is a cross-tenant escalation. The
 * ownership predicate on every statement below is still the security control;
 * this client only carries the write past the grant. Same pattern as the
 * checkout route uses for stripe_customer_id.
 */
function adminSupabase() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } },
  );
}

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
  const authClient = await createClient();
  const { data: { user: caller } } = await authClient.auth.getUser();
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const limit = await checkRate(
    { scope: "clone", windowMs: 10 * 60 * 1000, max: 4 },
    caller.id,
  );
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Please wait a moment before creating another voice." },
      { status: 429 },
    );
  }

  // NOTE: the monthly allowance is consumed further down, immediately before
  // the provider call — not here. Charging it up front meant a rejected
  // upload (too large, wrong type, provider error) still cost the user one of
  // their twelve voices for the month.

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid upload." }, { status: 400 });
  }

  const file = form.get("audio");
  const rawName = form.get("name");
  // Present when someone is improving a voice they already have. Only ever an
  // id of a row we then re-check against the caller's user_id — the voice id
  // itself is never taken from the client, which is what keeps this off the
  // path assertVoiceOwner protects.
  const targetSubjectId = z.uuid().safeParse(form.get("subjectId"));

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

  // Everything is validated — this request is now committed to creating a
  // voice, so it is the right moment to spend one of the month's twelve.
  const allowance = await consumeAllowance("clone", caller.id);
  if (!allowance.ok) {
    return NextResponse.json(
      { error: "monthly_allowance_reached", scope: "clone", resetsAt: allowance.resetsAt },
      { status: 429 },
    );
  }

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
        // Improving an existing person's voice.
        //
        // Every clone comes back with a brand new provider voice id, so without
        // this the "record a better sample" flow would quietly create a second
        // Margaret beside the first — with none of her conversations, none of
        // her memories, and no way to tell them apart on the shelf. Re-pointing
        // the row she already owns is the only behaviour that matches what the
        // person asked for.
        //
        // The ownership predicate is the security control: the row must be the
        // caller's and not deleted. The voice being written was created by this
        // request, so no client-supplied voice id ever reaches this column.
        if (targetSubjectId.success) {
          const { data: owned } = await supabase
            .from("subjects")
            .select("id")
            .eq("user_id", user.id)
            .eq("id", targetSubjectId.data)
            .is("deleted_at", null)
            .maybeSingle();

          if (owned) {
            subjectId = owned.id;
            // The name is left alone: it may have been edited since, and the
            // form carries whatever the recording screen was showing.
            //
            // The previous provider voice is deliberately not deleted. If the
            // new sample turns out worse, the old one is the only copy of how
            // they sounded, and the original audio may be long gone. Removing
            // a voice stays an explicit act, in the delete flow.
            // Service role, because migration 009 revoked voice_id from the
            // `authenticated` grant — the column decides what assertVoiceOwner
            // will let you speak in, so nothing holding a user's JWT may write
            // it. The ownership predicate below is still the security control;
            // the elevated client only carries the write past the grant.
            await adminSupabase()
              .from("subjects")
              .update({
                voice_id: result.voiceId,
                voice_name: labelledName,
                updated_at: new Date().toISOString(),
              })
              .eq("id", subjectId)
              .eq("user_id", user.id);
          }
        }

        // Only when this sample was not claimed by an existing person above —
        // otherwise the insert below would create the duplicate that whole
        // branch exists to prevent.
        if (!subjectId) {
          // Upsert: if a subject with this voice_id already exists (re-clone), update it
          const { data: existing } = await supabase
            .from("subjects")
            .select("id")
            .eq("user_id", user.id)
            .eq("voice_id", result.voiceId)
            .maybeSingle();

          if (existing) {
            subjectId = existing.id;
            // voice_name is revoked alongside voice_id — both name the voice
            // this row is allowed to speak in, so neither is user-writable.
            await adminSupabase()
              .from("subjects")
              .update({ name, voice_name: labelledName, updated_at: new Date().toISOString() })
              .eq("id", subjectId)
              .eq("user_id", user.id);
          } else {
            // Inserted under the service role for the same reason: user_id is
            // pinned to the authenticated caller here, and the voice is the one
            // this request just created at the provider.
            const { data: inserted } = await adminSupabase()
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
            subjectId = inserted?.id;
          }
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
