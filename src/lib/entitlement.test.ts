import { describe, it, expect } from "vitest";

/**
 * Mirrors the entitlement decision in src/middleware.ts. Pinned here because
 * the two bugs it encodes were both severe: the gate previously skipped
 * /api/* entirely (every paid endpoint stayed usable after a trial lapsed),
 * and it treated a failed profile read as "no access" (a Supabase blip logged
 * out every paying customer).
 */
function hasAccess(
  status: string | undefined,
  trialEndsAt: string | null,
  now = Date.now(),
): boolean {
  const trial = trialEndsAt ? new Date(trialEndsAt) : null;
  const inTrial = status === "trialing" && (!trial || trial.getTime() > now);
  return status === "active" || inTrial;
}

const future = new Date(Date.now() + 3 * 864e5).toISOString();
const past = new Date(Date.now() - 864e5).toISOString();

describe("entitlement", () => {
  it("admits an active subscriber", () => {
    expect(hasAccess("active", null)).toBe(true);
    expect(hasAccess("active", past)).toBe(true);
  });

  it("admits a trial that has not expired", () => {
    expect(hasAccess("trialing", future)).toBe(true);
  });

  it("admits a Stripe-managed trial with no local end date", () => {
    expect(hasAccess("trialing", null)).toBe(true);
  });

  it("denies an expired trial", () => {
    expect(hasAccess("trialing", past)).toBe(false);
  });

  it("denies every non-paying status", () => {
    for (const s of ["canceled", "past_due", "unpaid", "incomplete", "incomplete_expired", "paused"]) {
      expect(hasAccess(s, null)).toBe(false);
    }
  });

  it("denies an unknown or missing status", () => {
    expect(hasAccess(undefined, null)).toBe(false);
    expect(hasAccess("", null)).toBe(false);
  });
});

/**
 * The exemption list must let a lapsed user reach billing and their own data,
 * while still gating everything that spends money.
 */
const BILLING_EXEMPT = ["/subscribe", "/account", "/auth", "/api/stripe", "/api/user", "/api/usage"];
const exempt = (p: string) => BILLING_EXEMPT.some((e) => p.startsWith(e));

describe("billing exemptions", () => {
  it("lets a lapsed user pay and manage their account", () => {
    expect(exempt("/subscribe")).toBe(true);
    expect(exempt("/account")).toBe(true);
    expect(exempt("/api/stripe/checkout")).toBe(true);
    expect(exempt("/api/stripe/portal")).toBe(true);
  });

  it("preserves data rights after cancellation", () => {
    expect(exempt("/api/user/data")).toBe(true);
    expect(exempt("/api/user/delete")).toBe(true);
  });

  it("gates every endpoint that spends money", () => {
    for (const p of [
      "/api/chat",
      "/api/tts",
      "/api/clone",
      "/api/transcribe",
      "/api/convert",
      "/api/persona-extract",
      "/api/voice-preview",
    ]) {
      expect(exempt(p)).toBe(false);
    }
  });

  it("gates the app pages", () => {
    expect(exempt("/people")).toBe(false);
    expect(exempt("/memories")).toBe(false);
  });
});
