/**
 * Who gets in, and what we tell them about it.
 *
 * This rule used to be written out three times — in the middleware gate, on the
 * account screen, and in the subscribe page's sub-line — and the copies drifted.
 * The middleware locked an expired trial out (correctly) while both screens went
 * on calling it active, so someone whose week had run out was bounced to a
 * paywall that reassured them nothing had stopped.
 *
 * Pure functions with no imports: the middleware runs in a restricted runtime,
 * and the tests import these directly rather than restating them.
 */

/** Statuses that mean the subscription itself is paying. */
const PAYING = new Set(["active"]);

/**
 * A trial is only live while it has time left on it.
 *
 * `trialEndsAt` is null for trials Stripe manages (legacy checkouts), which
 * expire by webhook status change instead — so a null end date means "no local
 * expiry to check", not "already over".
 */
export function isTrialLive(
  status: string | null | undefined,
  trialEndsAt: string | Date | null | undefined,
  now: number = Date.now(),
): boolean {
  if (status !== "trialing") return false;
  if (!trialEndsAt) return true;
  return new Date(trialEndsAt).getTime() > now;
}

/** The entitlement decision. Mirrors what middleware.ts enforces. */
export function hasAccess(
  status: string | null | undefined,
  trialEndsAt: string | Date | null | undefined,
  now: number = Date.now(),
): boolean {
  return PAYING.has(status ?? "") || isTrialLive(status, trialEndsAt, now);
}

/** A trial that was real and has since run out — the case both screens missed. */
export function isTrialExpired(
  status: string | null | undefined,
  trialEndsAt: string | Date | null | undefined,
  now: number = Date.now(),
): boolean {
  return status === "trialing" && Boolean(trialEndsAt) && !isTrialLive(status, trialEndsAt, now);
}

/**
 * Whole days remaining, or null when there is no live trial to count.
 *
 * Never clamps a negative to zero: that is what made an expired trial read
 * "Trial ends today" forever instead of admitting it had ended.
 */
export function trialDaysLeft(
  status: string | null | undefined,
  trialEndsAt: string | Date | null | undefined,
  now: number = Date.now(),
): number | null {
  if (!trialEndsAt || !isTrialLive(status, trialEndsAt, now)) return null;
  return Math.max(0, Math.ceil((new Date(trialEndsAt).getTime() - now) / 86_400_000));
}

/**
 * Paths a user without access may still reach: billing (so they can pay),
 * their account, and their own data (rights survive cancellation).
 */
export const BILLING_EXEMPT = [
  "/subscribe",
  "/account",
  "/auth",
  "/api/stripe",
  "/api/user",
  "/api/usage",
] as const;

export function isBillingExempt(pathname: string): boolean {
  return BILLING_EXEMPT.some((prefix) => pathname.startsWith(prefix));
}
