import { describe, it, expect } from "vitest";
import { usageLines, formatResetDate, EMPHASIS_THRESHOLD } from "./usageView";

function allowance(used: number, limit: number) {
  return {
    used,
    limit,
    // Deliberately wrong in most cases: the view must not trust it.
    fraction: 0,
    resetsAt: "2026-09-01T00:00:00.000Z",
  };
}

describe("usageLines", () => {
  it("stays quiet until usage is genuinely high", () => {
    // The whole point of the threshold: ordinary use must never be told it is
    // approaching a ceiling it will not reach.
    const [chat] = usageLines({ chat: allowance(12, 600) });
    expect(chat?.emphasised).toBe(false);
    expect(chat?.spent).toBe(false);
  });

  it("emphasises only above the threshold, not at it", () => {
    const at = usageLines({ chat: allowance(480, 600) })[0];
    const past = usageLines({ chat: allowance(481, 600) })[0];
    expect(480 / 600).toBe(EMPHASIS_THRESHOLD);
    expect(at?.emphasised).toBe(false);
    expect(past?.emphasised).toBe(true);
  });

  it("never renders a count above the allowance", () => {
    // The allowance check fails open, so the stored counter can exceed the
    // limit. "612 of 600" reads as a billing error, never as generosity.
    const [chat] = usageLines({ chat: allowance(612, 600) });
    expect(chat?.used).toBe(600);
    expect(chat?.spent).toBe(true);
  });

  it("never lets the meter overflow its track", () => {
    expect(usageLines({ chat: allowance(9000, 600) })[0]?.percent).toBe(100);
    expect(usageLines({ chat: allowance(0, 600) })[0]?.percent).toBe(0);
  });

  it("ignores the served fraction and recomputes it", () => {
    // A cached fraction against a changed limit would emphasise the wrong scope.
    const line = usageLines({ chat: { ...allowance(599, 600), fraction: 0 } })[0];
    expect(line?.emphasised).toBe(true);
  });

  it("drops a scope the endpoint did not return", () => {
    // /api/usage may be older than this page; a missing scope must vanish
    // rather than render as an empty meter.
    const scopes = usageLines({ chat: allowance(1, 600), reading: null }).map((l) => l.scope);
    expect(scopes).toEqual(["chat"]);
  });

  it("drops a scope with a nonsensical limit instead of dividing by it", () => {
    expect(usageLines({ chat: allowance(3, 0) })).toEqual([]);
    expect(usageLines({ chat: allowance(3, Number.NaN) })).toEqual([]);
  });

  it("treats a missing used count as none used", () => {
    const [chat] = usageLines({ chat: { ...allowance(0, 600), used: undefined as unknown as number } });
    expect(chat?.used).toBe(0);
    expect(chat?.percent).toBe(0);
  });

  it("returns nothing when usage could not be read at all", () => {
    expect(usageLines(null)).toEqual([]);
    expect(usageLines(undefined)).toEqual([]);
  });

  it("leads with the headline number", () => {
    const scopes = usageLines({
      clone: allowance(1, 12),
      reading: allowance(2, 40),
      chat: allowance(3, 600),
    }).map((l) => l.scope);
    expect(scopes).toEqual(["chat", "reading", "clone"]);
  });
});

describe("formatResetDate", () => {
  it("names the day the allowance comes back", () => {
    // Midday so the assertion holds whatever timezone the test machine is in.
    expect(formatResetDate("2026-09-01T12:00:00.000Z")).toBe("on 1 September");
  });

  it("falls back to plain language rather than showing Invalid Date", () => {
    expect(formatResetDate("not a date")).toBe("next month");
    expect(formatResetDate(null)).toBe("next month");
    expect(formatResetDate(undefined)).toBe("next month");
  });
});
