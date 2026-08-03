import "server-only";
import { createClient } from "@supabase/supabase-js";
import { env } from "./env";

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
 * Monthly allowances for a $30/month subscriber.
 *
 * Deliberately generous — set so that essentially nobody using the product the
 * way it is meant to be used ever meets them. They exist as a ceiling against
 * runaway cost (every reply spends OpenAI + ElevenLabs money), not as a meter
 * the user is meant to feel. Anyone who does reach one is told plainly, in
 * their own language, and never mid-sentence.
 */
export const MONTHLY_ALLOWANCE = {
  /** Spoken replies from a persona — the headline number. */
  chat: 600,
  /** New voices created. */
  clone: 12,
} as const;

export type AllowanceScope = keyof typeof MONTHLY_ALLOWANCE;

export interface AllowanceResult {
  ok: boolean;
  used: number;
  limit: number;
  /** 0–1. The account screen surfaces usage once this passes 0.8. */
  fraction: number;
  /** First instant of the next calendar month, ISO. */
  resetsAt: string;
}

/** Service-role client: counters must never be writable from the browser. */
function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

/** Start of the current calendar month, UTC. */
export function monthStart(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/** Start of the next calendar month, UTC — when an allowance comes back. */
export function monthEnd(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}

async function bump(userId: string, scope: string, periodStart: Date): Promise<number | null> {
  try {
    const { data, error } = await admin().rpc("increment_usage", {
      p_user_id: userId,
      p_scope: scope,
      p_period_start: periodStart.toISOString(),
    });
    if (error) return null;
    return typeof data === "number" ? data : null;
  } catch {
    return null;
  }
}

/**
 * Short-window burst guard. Catches runaway client loops and scripted abuse;
 * the windows are wide enough that ordinary use never touches them.
 *
 * Fails OPEN: if the counter store is unreachable we allow the request rather
 * than block a grieving user over an infrastructure blip. The monthly
 * allowance below is the real cost ceiling.
 */
export async function checkRate(
  limit: RateLimit,
  userId?: string | null,
): Promise<RateLimitResult> {
  if (!userId) return { ok: true, remaining: Number.POSITIVE_INFINITY, resetMs: 0 };

  const now = Date.now();
  const bucket = new Date(Math.floor(now / limit.windowMs) * limit.windowMs);
  const count = await bump(userId, `burst:${limit.scope}`, bucket);
  if (count === null) return { ok: true, remaining: Number.POSITIVE_INFINITY, resetMs: 0 };

  const resetMs = bucket.getTime() + limit.windowMs - now;
  return { ok: count <= limit.max, remaining: Math.max(0, limit.max - count), resetMs };
}

/**
 * Consume one unit of a monthly allowance. Call this only once the work is
 * actually going to happen, so a failed request never costs the user a reply.
 *
 * Fails OPEN for the same reason as above.
 */
export async function consumeAllowance(
  scope: AllowanceScope,
  userId: string,
): Promise<AllowanceResult> {
  const limitValue = MONTHLY_ALLOWANCE[scope];
  const count = await bump(userId, `month:${scope}`, monthStart());
  const used = count ?? 0;
  return {
    ok: count === null || count <= limitValue,
    used,
    limit: limitValue,
    fraction: limitValue > 0 ? Math.min(1, used / limitValue) : 0,
    resetsAt: monthEnd().toISOString(),
  };
}

/** Read an allowance without consuming it — for the account screen. */
export async function readAllowance(
  scope: AllowanceScope,
  userId: string,
): Promise<AllowanceResult> {
  const limitValue = MONTHLY_ALLOWANCE[scope];
  let used = 0;
  try {
    const { data } = await admin()
      .from("usage_counters")
      .select("count")
      .eq("user_id", userId)
      .eq("scope", `month:${scope}`)
      .eq("period_start", monthStart().toISOString())
      .maybeSingle();
    used = (data?.count as number | undefined) ?? 0;
  } catch {
    used = 0;
  }
  return {
    ok: used < limitValue,
    used,
    limit: limitValue,
    fraction: limitValue > 0 ? Math.min(1, used / limitValue) : 0,
    resetsAt: monthEnd().toISOString(),
  };
}
