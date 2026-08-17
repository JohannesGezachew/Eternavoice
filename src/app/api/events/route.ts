import { NextResponse } from "next/server";
import { z } from "zod";
import { checkRate } from "@/lib/rateLimit";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  source: z.string().min(1).max(120),
  message: z.string().min(1).max(1000),
  stack: z.string().max(6000).optional(),
  digest: z.string().max(200).optional(),
  context: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
});

/**
 * Keys a client may attach to an error report. Everything else is discarded:
 * a free-form record on a conversation screen is one careless call away from
 * carrying what somebody said to their mother.
 */
const SAFE_CONTEXT_KEYS = new Set([
  "status",
  "attempts",
  "reason",
  "scope",
  "label",
  "elapsedMs",
  "turnCount",
  "chars",
  "route",
]);

function pickSafeContext(
  context: Record<string, string | number | boolean | null> | undefined,
): Record<string, string | number | boolean | null> | undefined {
  if (!context) return undefined;
  const safe: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(context)) {
    if (!SAFE_CONTEXT_KEYS.has(key)) continue;
    safe[key] = typeof value === "string" ? value.slice(0, 120) : value;
  }
  return Object.keys(safe).length ? safe : undefined;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const limit = await checkRate(
    { scope: "client-events", windowMs: 60 * 60 * 1000, max: 120 },
    user?.id,
  );
  if (!limit.ok) {
    return NextResponse.json({ ok: true });
  }

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  // Redacted before it reaches the log sink.
  //
  // This wrote `message`, up to 6 KB of `stack` and a free-form `context`
  // record straight into Vercel's logs. On a conversation surface those carry
  // transcript fragments and the names of people who have died — bereavement
  // data landing in a store with a different retention and access model than
  // the encrypted database it was so carefully kept out of.
  console.error("[client-error]", {
    source: parsed.data.source,
    message: parsed.data.message.slice(0, 300),
    digest: parsed.data.digest,
    // Frames only: the file/line path is what diagnoses a bug, and the
    // surrounding source text is what leaks.
    stack: parsed.data.stack
      ?.split("\n")
      .slice(0, 12)
      .map((line) => line.trim().slice(0, 200))
      .join("\n"),
    // Allowlisted: anything not named here is dropped rather than trusted.
    context: pickSafeContext(parsed.data.context),
  });
  return NextResponse.json({ ok: true });
}
