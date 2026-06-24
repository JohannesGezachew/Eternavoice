import "server-only";

export interface RateLimit {
  windowMs: number;
  max: number;
  scope: string;
}

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  resetMs: number;
}

/**
 * Rate limiting is temporarily DISABLED.
 *
 * The previous implementation was an in-memory Map, which isn't durable on
 * serverless (per-instance, wiped on cold start) and — with no customers yet —
 * only got in the way of testing. This stub always allows.
 *
 * Before public launch, replace this with a durable, per-user limiter
 * (Redis / Vercel KV / a Postgres counter) plus monthly usage caps on the paid
 * endpoints (chat, transcribe, clone, voice-preview, backchannel). Every call
 * site already does `const limit = await checkRate(...); if (!limit.ok) ...`,
 * so re-enabling is a single-file change.
 */
export async function checkRate(_limit: RateLimit): Promise<RateLimitResult> {
  return { ok: true, remaining: Number.POSITIVE_INFINITY, resetMs: 0 };
}
