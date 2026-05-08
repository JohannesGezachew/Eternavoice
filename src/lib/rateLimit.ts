import "server-only";
import { cookies } from "next/headers";
import { randomUUID } from "node:crypto";

const SESSION_COOKIE = "ev_session";

interface Bucket {
  windowStart: number;
  count: number;
}

const buckets = new Map<string, Bucket>();

function gcBuckets(now: number) {
  if (buckets.size < 1024) return;
  for (const [key, bucket] of buckets) {
    if (now - bucket.windowStart > 60 * 60 * 1000) buckets.delete(key);
  }
}

export async function getSessionId(): Promise<string> {
  const store = await cookies();
  const existing = store.get(SESSION_COOKIE)?.value;
  if (existing) return existing;
  const id = randomUUID();
  store.set(SESSION_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 7,
    path: "/",
  });
  return id;
}

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

export async function checkRate(limit: RateLimit): Promise<RateLimitResult> {
  const id = await getSessionId();
  const now = Date.now();
  gcBuckets(now);
  const key = `${id}:${limit.scope}`;
  const bucket = buckets.get(key);
  if (!bucket || now - bucket.windowStart > limit.windowMs) {
    buckets.set(key, { windowStart: now, count: 1 });
    return { ok: true, remaining: limit.max - 1, resetMs: limit.windowMs };
  }
  if (bucket.count >= limit.max) {
    return {
      ok: false,
      remaining: 0,
      resetMs: limit.windowMs - (now - bucket.windowStart),
    };
  }
  bucket.count += 1;
  return {
    ok: true,
    remaining: limit.max - bucket.count,
    resetMs: limit.windowMs - (now - bucket.windowStart),
  };
}
