import { describe, it, expect } from "vitest";
import { backoffMs, withRetry, SAVE_ATTEMPTS } from "./retry";

/**
 * The failure being pinned: a conversation save that lost a write to one
 * dropped packet, and a retry loop that would have hidden a dead session
 * behind four rounds of waiting instead of telling the user to sign in.
 */

/** Records what would have been waited for, without waiting for it. */
function recordingSleep() {
  const slept: number[] = [];
  return {
    slept,
    sleep: async (ms: number) => {
      slept.push(ms);
    },
  };
}

describe("backoffMs", () => {
  it("grows, so a struggling connection is not hit at the same rate", () => {
    expect(backoffMs(1)).toBe(500);
    expect(backoffMs(2)).toBe(1500);
    expect(backoffMs(3)).toBe(4500);
  });

  it("keeps the whole run inside the time a person will wait", () => {
    const total = Array.from({ length: SAVE_ATTEMPTS - 1 }, (_, i) => backoffMs(i + 1)).reduce(
      (a, b) => a + b,
      0,
    );
    expect(total).toBeLessThan(10_000);
  });

  it("is deterministic — no jitter to make the policy untestable", () => {
    expect(backoffMs(2)).toBe(backoffMs(2));
  });
});

describe("withRetry", () => {
  it("does not wait at all when the first attempt lands", async () => {
    const { slept, sleep } = recordingSleep();
    const result = await withRetry(async () => "saved", { sleep });
    expect(result).toEqual({ ok: true, value: "saved", attempts: 1 });
    expect(slept).toEqual([]);
  });

  it("recovers a write that a transient failure would have lost", async () => {
    const { slept, sleep } = recordingSleep();
    let calls = 0;
    const result = await withRetry(
      async () => {
        calls += 1;
        if (calls < 3) throw new Error("network");
        return "saved";
      },
      { sleep },
    );
    expect(result.ok).toBe(true);
    expect(result.attempts).toBe(3);
    expect(slept).toEqual([500, 1500]);
  });

  it("gives up after the bound and hands back the failure to be surfaced", async () => {
    const { slept, sleep } = recordingSleep();
    const boom = new Error("still down");
    const result = await withRetry(async () => Promise.reject(boom), { sleep });
    expect(result).toEqual({ ok: false, error: boom, attempts: SAVE_ATTEMPTS });
    // Three waits for four attempts — never a wait after the last one.
    expect(slept).toHaveLength(SAVE_ATTEMPTS - 1);
  });

  it("stops immediately on a failure that cannot come good", async () => {
    const { slept, sleep } = recordingSleep();
    let calls = 0;
    const result = await withRetry(
      async () => {
        calls += 1;
        throw new Error("Unauthorized");
      },
      { sleep, retryable: (e) => (e as Error).message !== "Unauthorized" },
    );
    // Four rounds of backoff against an expired session is four rounds of the
    // user not being told to sign in.
    expect(calls).toBe(1);
    expect(result.ok).toBe(false);
    expect(slept).toEqual([]);
  });

  it("reports an outcome instead of throwing, so it cannot be .catch(console.error)'d away", async () => {
    await expect(
      withRetry(async () => Promise.reject(new Error("boom")), { attempts: 1 }),
    ).resolves.toMatchObject({ ok: false });
  });
});
