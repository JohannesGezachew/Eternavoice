/**
 * A bounded retry for writes that must not be lost to a blip.
 *
 * The conversation save was `saveConversation(...).catch(console.error)`. One
 * dropped packet on a train and that write was gone until the next assistant
 * reply happened to fire another save — and if the conversation ended there,
 * gone for good. A grief product cannot lose the last thing someone said.
 *
 * Bounded on purpose. Retrying forever would queue writes behind a genuinely
 * broken session and keep the user staring at a spinner instead of telling
 * them the truth, which is what `withRetry` returning an outcome is for.
 */

/** Attempts including the first. Four covers ~7s of flakiness, which is the
 *  shape of a tunnel or a Wi-Fi handover; longer than that is not transient. */
export const SAVE_ATTEMPTS = 4;

/**
 * Backoff for `attempt` (1 = the first retry): 500ms, 1.5s, 4.5s.
 *
 * Deliberately no jitter. Jitter exists to desynchronise a herd of clients
 * hammering one server; this is a single browser saving its own conversation,
 * so the only thing randomness would buy is a policy that cannot be asserted
 * on in a test.
 */
export function backoffMs(attempt: number): number {
  return 500 * 3 ** Math.max(0, attempt - 1);
}

export type RetryResult<T> =
  | { ok: true; value: T; attempts: number }
  | { ok: false; error: unknown; attempts: number };

export interface RetryOptions {
  attempts?: number;
  delayFor?: (attempt: number) => number;
  sleep?: (ms: number) => Promise<void>;
  /**
   * Whether another go could plausibly work. An expired session or a rejected
   * row fails identically every time — retrying those just delays the moment
   * the user is told what actually happened.
   */
  retryable?: (error: unknown) => boolean;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Returns the outcome rather than throwing.
 *
 * That is the whole point: the call site this replaces ended in
 * `.catch(console.error)`, and a throw is exactly the thing that invites
 * another one of those. An outcome has to be looked at.
 */
export async function withRetry<T>(
  run: (attempt: number) => Promise<T>,
  options: RetryOptions = {},
): Promise<RetryResult<T>> {
  const {
    attempts = SAVE_ATTEMPTS,
    delayFor = backoffMs,
    sleep = defaultSleep,
    retryable = () => true,
  } = options;

  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return { ok: true, value: await run(attempt), attempts: attempt };
    } catch (error) {
      lastError = error;
      if (attempt === attempts || !retryable(error)) {
        return { ok: false, error, attempts: attempt };
      }
      await sleep(delayFor(attempt));
    }
  }
  // Unreachable while attempts >= 1; kept so a caller passing 0 gets an
  // outcome rather than undefined.
  return { ok: false, error: lastError, attempts: 0 };
}
