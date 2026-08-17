import { describe, it, expect, beforeEach } from "vitest";
import { persistChange, setSyncFailure, getSyncFailure } from "./persistChange";
import { SessionExpiredError, SESSION_ENDED_MESSAGE } from "@/lib/authError";

/**
 * The rule this pins: a failed write must never leave the screen showing the
 * change as though it had worked.
 *
 * The call sites this replaced all ended in `.catch(console.error)`, so a
 * deleted conversation came back on the next load with nothing ever said about
 * it. Reverting is the part that is easy to drop later — a future edit that
 * only surfaces the message would look correct and still lie.
 */

// The module writes its failure into shared state; each test starts clean.
beforeEach(() => setSyncFailure(null));

// persistChange sleeps between attempts with real timers, so the failing tests
// pass an instant sleep in via the same retry defaults the caller cannot see —
// instead we keep the failures to a single fast attempt by throwing a
// non-retryable error, and cover the retry policy in retry.test.ts.

describe("persistChange", () => {
  it("does not revert a write that landed", async () => {
    let reverted = false;
    const ok = await persistChange({
      source: "test",
      run: async () => undefined,
      revert: () => {
        reverted = true;
      },
      describe: "delete that conversation",
    });
    expect(ok).toBe(true);
    expect(reverted).toBe(false);
  });

  it("retries before giving up", async () => {
    let attempts = 0;
    const ok = await persistChange({
      source: "test",
      run: async () => {
        attempts += 1;
        if (attempts < 2) throw new Error("network");
        return undefined;
      },
      revert: () => {},
      describe: "pin that",
    });
    expect(ok).toBe(true);
    expect(attempts).toBe(2);
  });

  it("reverts and says so when the write never lands", async () => {
    let reverted = false;
    const ok = await persistChange({
      source: "test",
      // Not retryable, so this resolves without burning the backoff.
      run: async () => {
        throw new SessionExpiredError();
      },
      revert: () => {
        reverted = true;
      },
      describe: "delete that conversation",
    });
    expect(ok).toBe(false);
    expect(reverted).toBe(true);
  });

  it("offers signing in again rather than 'check your connection'", async () => {
    // A lapsed session is the one failure where retrying cannot help and the
    // generic message sends the user to fiddle with their wifi.
    let message: string | null = null;
    await persistChange({
      source: "test",
      run: async () => {
        throw new SessionExpiredError();
      },
      revert: () => {
        message = getSyncFailure();
      },
      describe: "delete that conversation",
    });
    expect(getSyncFailure()).toBe(SESSION_ENDED_MESSAGE);
    // revert runs before the message is set, so the screen is already true by
    // the time anything is said about it.
    expect(message).toBeNull();
  });

  it("names the thing that did not happen", async () => {
    await persistChange({
      source: "test",
      run: async () => {
        throw new SessionExpiredError();
      },
      revert: () => {},
      describe: "delete that conversation",
    });
    setSyncFailure(null);

    await persistChange({
      source: "test",
      run: async () => {
        throw Object.assign(new Error("boom"), { name: "TypeError" });
      },
      revert: () => {},
      describe: "delete that conversation",
      // A generic failure does retry, which is the behaviour we want; the
      // assertion is on what it eventually says.
    });
    expect(getSyncFailure()).toContain("delete that conversation");
    expect(getSyncFailure()).toContain("undone");
  }, 15_000);
});
