import { describe, it, expect } from "vitest";
import { isQuotaExceeded, quotaAwareStorage } from "./storageQuota";

/**
 * The failure this guards: localStorage fills up, zustand's persist middleware
 * catches the throw, and the app goes on looking like it is saving. The user
 * finds out on the next reload, or never.
 */

/** A DOMException as each engine actually raises it. */
function domError(name: string, code: number): Error {
  const error = new Error("The quota has been exceeded.");
  error.name = name;
  (error as Error & { code: number }).code = code;
  return error;
}

/** An in-memory Storage with a byte ceiling, so the quota path is real. */
function fakeStorage(limitBytes = Infinity): Storage & { size: () => number } {
  const map = new Map<string, string>();
  const used = () =>
    [...map.entries()].reduce((n, [k, v]) => n + k.length + v.length, 0);
  return {
    get length() {
      return map.size;
    },
    key: (i: number) => [...map.keys()][i] ?? null,
    getItem: (k: string) => map.get(k) ?? null,
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    setItem(k: string, v: string) {
      const next = used() - (map.get(k)?.length ?? 0) - (map.has(k) ? k.length : 0) + k.length + v.length;
      if (next > limitBytes) throw domError("QuotaExceededError", 22);
      map.set(k, v);
    },
    size: used,
  };
}

describe("isQuotaExceeded", () => {
  it("recognises the quota error from every engine that raises one", () => {
    // Chrome / Safari.
    expect(isQuotaExceeded(domError("QuotaExceededError", 22))).toBe(true);
    // Firefox — the case a name-only check missed, and the browser most
    // likely to be running with a small quota in the first place.
    expect(isQuotaExceeded(domError("NS_ERROR_DOM_QUOTA_REACHED", 1014))).toBe(true);
    expect(isQuotaExceeded(domError("QuotaExceededError", 1014))).toBe(true);
    // Older Safari.
    expect(isQuotaExceeded(domError("QUOTA_EXCEEDED_ERR", 22))).toBe(true);
  });

  it("does not mistake other storage failures for a full disk", () => {
    // Private browsing / blocked third-party storage. Real, but not "full" —
    // telling someone to free up space would be a lie.
    expect(isQuotaExceeded(domError("SecurityError", 18))).toBe(false);
    expect(isQuotaExceeded(new Error("network"))).toBe(false);
    expect(isQuotaExceeded(null)).toBe(false);
    expect(isQuotaExceeded(undefined)).toBe(false);
    expect(isQuotaExceeded("QuotaExceededError")).toBe(false);
    // A bare object with a DOM-looking code is not a DOM exception.
    expect(isQuotaExceeded({ code: 22 })).toBe(false);
  });
});

describe("quotaAwareStorage", () => {
  it("reads and writes through when there is room, and reports healthy", () => {
    const flags: boolean[] = [];
    const store = quotaAwareStorage(fakeStorage(), (full) => flags.push(full));
    store.setItem("a", "1");
    expect(store.getItem("a")).toBe("1");
    expect(store.length).toBe(1);
    expect(flags).toEqual([false]);
  });

  it("reports a full store instead of letting the write vanish silently", () => {
    const flags: boolean[] = [];
    const store = quotaAwareStorage(fakeStorage(8), (full) => flags.push(full));
    store.setItem("k", "v");
    expect(flags).toEqual([false]);

    // Over the ceiling: persist would have swallowed this and carried on.
    store.setItem("k", "a".repeat(64));
    expect(flags).toEqual([false, true]);
    // The old value survives — a failed write must not destroy what was there.
    expect(store.getItem("k")).toBe("v");
  });

  it("does not throw on a quota failure — a cache write must not end a conversation", () => {
    const store = quotaAwareStorage(fakeStorage(1), () => {});
    expect(() => store.setItem("k", "value")).not.toThrow();
  });

  it("clears the flag once a write lands again", () => {
    const flags: boolean[] = [];
    const base = fakeStorage(24);
    const store = quotaAwareStorage(base, (full) => flags.push(full));
    store.setItem("k", "a".repeat(64));
    expect(flags.at(-1)).toBe(true);
    // The user freed up space. Leaving the notice up after that is its own bug.
    store.setItem("k", "small");
    expect(flags.at(-1)).toBe(false);
  });

  it("still throws anything that is not a quota failure", () => {
    const base = fakeStorage();
    base.setItem = () => {
      const error = new Error("blocked");
      error.name = "SecurityError";
      throw error;
    };
    const store = quotaAwareStorage(base, () => {});
    // Swallowing this would hide a different problem behind a "disk full"
    // message the user cannot act on.
    expect(() => store.setItem("k", "v")).toThrow("blocked");
  });
});
