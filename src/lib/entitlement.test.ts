import { describe, it, expect } from "vitest";
import {
  hasAccess,
  isTrialLive,
  isTrialExpired,
  trialDaysLeft,
  isBillingExempt,
} from "./entitlement";

/**
 * The entitlement decision behind src/middleware.ts.
 *
 * These import the real functions rather than restating them. An earlier
 * version of this file re-implemented the rule, which meant it kept passing
 * while the screens that describe the gate drifted away from the gate itself —
 * an expired trial was locked out by the middleware and called active by both
 * the account and subscribe pages.
 *
 * Three bugs are pinned here, all of them severe: the gate once skipped /api/*
 * entirely (every paid endpoint stayed usable after a trial lapsed), it once
 * treated a failed profile read as "no access" (a Supabase blip logged out
 * every paying customer), and the day counter once clamped negatives to zero
 * (a lapsed trial read "Trial ends today" forever).
 */

const NOW = Date.parse("2026-08-17T12:00:00Z");
const future = new Date(NOW + 3 * 864e5).toISOString();
const past = new Date(NOW - 864e5).toISOString();

describe("hasAccess", () => {
  it("admits an active subscriber", () => {
    expect(hasAccess("active", null, NOW)).toBe(true);
    expect(hasAccess("active", past, NOW)).toBe(true);
  });

  it("admits a trial that has not expired", () => {
    expect(hasAccess("trialing", future, NOW)).toBe(true);
  });

  it("admits a Stripe-managed trial with no local end date", () => {
    // Null means "no local expiry to check" — those lapse by webhook instead.
    expect(hasAccess("trialing", null, NOW)).toBe(true);
  });

  it("denies an expired trial", () => {
    expect(hasAccess("trialing", past, NOW)).toBe(false);
  });

  it("does not cut someone off in the middle of a conversation", () => {
    // The gate used to fall the instant trial_ends_at passed, which for a
    // product used at 2am while grieving meant being cut off mid-sentence by
    // someone you have lost. Six hours is longer than any single sitting, so
    // the end of a trial lands between conversations rather than inside one.
    const justEnded = new Date(NOW - 60_000).toISOString();
    const twoHoursAgo = new Date(NOW - 2 * 3600_000).toISOString();
    expect(hasAccess("trialing", justEnded, NOW)).toBe(true);
    expect(hasAccess("trialing", twoHoursAgo, NOW)).toBe(true);
  });

  it("closes the grace window rather than extending the trial", () => {
    const sevenHoursAgo = new Date(NOW - 7 * 3600_000).toISOString();
    expect(hasAccess("trialing", sevenHoursAgo, NOW)).toBe(false);
  });

  it("grace never rescues a cancelled or unpaid subscription", () => {
    // It applies to a trial ending, not to a payment failing.
    const justEnded = new Date(NOW - 60_000).toISOString();
    expect(hasAccess("canceled", justEnded, NOW)).toBe(false);
    expect(hasAccess("past_due", justEnded, NOW)).toBe(false);
  });

  it("still tells the truth about the trial while the gate is lenient", () => {
    // The screens must say "ended" the moment it ends — the grace is invisible
    // and only prevents an interruption.
    const justEnded = new Date(NOW - 60_000).toISOString();
    expect(isTrialExpired("trialing", justEnded, NOW)).toBe(true);
    expect(isTrialLive("trialing", justEnded, NOW)).toBe(false);
    expect(trialDaysLeft("trialing", justEnded, NOW)).toBeNull();
  });

  it("denies every non-paying status", () => {
    for (const s of ["canceled", "past_due", "unpaid", "incomplete", "incomplete_expired", "paused"]) {
      expect(hasAccess(s, null, NOW)).toBe(false);
    }
  });

  it("denies an unknown or missing status", () => {
    expect(hasAccess(undefined, null, NOW)).toBe(false);
    expect(hasAccess(null, null, NOW)).toBe(false);
    expect(hasAccess("", null, NOW)).toBe(false);
  });
});

describe("trial state, as the account and subscribe screens read it", () => {
  it("agrees with the gate: live trial means access", () => {
    expect(isTrialLive("trialing", future, NOW)).toBe(true);
    expect(hasAccess("trialing", future, NOW)).toBe(true);
  });

  it("agrees with the gate: expired trial means no access", () => {
    // The exact case both screens used to get wrong.
    expect(isTrialExpired("trialing", past, NOW)).toBe(true);
    expect(isTrialLive("trialing", past, NOW)).toBe(false);
    expect(hasAccess("trialing", past, NOW)).toBe(false);
  });

  it("does not call a cancelled subscription an expired trial", () => {
    expect(isTrialExpired("canceled", past, NOW)).toBe(false);
    expect(isTrialExpired("active", past, NOW)).toBe(false);
  });

  it("does not call a Stripe-managed trial expired", () => {
    expect(isTrialExpired("trialing", null, NOW)).toBe(false);
  });

  it("counts whole days left", () => {
    expect(trialDaysLeft("trialing", future, NOW)).toBe(3);
    expect(trialDaysLeft("trialing", new Date(NOW + 6 * 36e5).toISOString(), NOW)).toBe(1);
  });

  it("returns null once the trial is over instead of clamping to zero", () => {
    // Clamping is what rendered "Trial ends today" indefinitely.
    expect(trialDaysLeft("trialing", past, NOW)).toBeNull();
    expect(trialDaysLeft("canceled", future, NOW)).toBeNull();
    expect(trialDaysLeft("active", null, NOW)).toBeNull();
  });
});

/**
 * The exemption list must let a lapsed user pay and reach their own data,
 * while still gating everything that spends money.
 */
describe("billing exemptions", () => {
  it("lets a lapsed user pay and manage their account", () => {
    expect(isBillingExempt("/subscribe")).toBe(true);
    expect(isBillingExempt("/account")).toBe(true);
    expect(isBillingExempt("/api/stripe/checkout")).toBe(true);
    expect(isBillingExempt("/api/stripe/portal")).toBe(true);
  });

  it("preserves data rights after cancellation", () => {
    expect(isBillingExempt("/api/user/data")).toBe(true);
    expect(isBillingExempt("/api/user/delete")).toBe(true);
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
      "/api/conversations/abc/summarise",
    ]) {
      expect(isBillingExempt(p)).toBe(false);
    }
  });

  it("gates the app pages", () => {
    expect(isBillingExempt("/people")).toBe(false);
    expect(isBillingExempt("/memories")).toBe(false);
    expect(isBillingExempt("/conversations")).toBe(false);
  });
});
