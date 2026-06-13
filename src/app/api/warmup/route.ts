import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Latency primer. Hit the instant the user starts speaking so the chat
 * function is warm (and its TLS/connection pool open) by the time the
 * transcript is ready. Importing the provider clients here pays the module
 * init cost ahead of the real request rather than inside it.
 *
 * Deliberately does no network I/O to the providers — just warms the lambda
 * and module graph. Cheap, idempotent, fire-and-forget.
 */
export async function GET() {
  try {
    await Promise.all([import("@/lib/openai"), import("@/lib/elevenlabs")]);
  } catch {
    // warmup is best-effort
  }
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
