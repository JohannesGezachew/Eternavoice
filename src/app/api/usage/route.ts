import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { readAllowance } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * This month's usage against the subscriber's allowance. Read-only, and it
 * answers one question: how much of the month is left?
 *
 * Every scope with an allowance is returned, readings included. Reading was
 * missing while it was the tightest ceiling of the three — forty a month, each
 * one worth roughly forty replies — so the one allowance somebody could
 * plausibly meet was the one the account screen could not show them.
 */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [chat, clone, reading] = await Promise.all([
    readAllowance("chat", user.id),
    readAllowance("clone", user.id),
    readAllowance("reading", user.id),
  ]);

  return NextResponse.json(
    { chat, clone, reading },
    { headers: { "Cache-Control": "no-store" } },
  );
}
