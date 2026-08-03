import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { readAllowance } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * This month's usage against the subscriber's allowance. Read-only — the
 * account screen stays quiet until usage is high, so this exists mainly to
 * answer "am I near the ceiling?".
 */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [chat, clone] = await Promise.all([
    readAllowance("chat", user.id),
    readAllowance("clone", user.id),
  ]);

  return NextResponse.json(
    { chat, clone },
    { headers: { "Cache-Control": "no-store" } },
  );
}
