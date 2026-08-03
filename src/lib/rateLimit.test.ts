import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

// The module builds a Supabase client at call time; these are never used here
// because only the pure period maths and the allowance table are exercised.
process.env.NEXT_PUBLIC_SUPABASE_URL ??= "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const { monthStart, monthEnd, MONTHLY_ALLOWANCE } = await import("./rateLimit");

describe("monthly period boundaries", () => {
  it("starts at midnight UTC on the first of the month", () => {
    const start = monthStart(new Date("2026-08-17T13:45:00Z"));
    expect(start.toISOString()).toBe("2026-08-01T00:00:00.000Z");
  });

  it("ends at the first instant of the next month", () => {
    const end = monthEnd(new Date("2026-08-17T13:45:00Z"));
    expect(end.toISOString()).toBe("2026-09-01T00:00:00.000Z");
  });

  it("rolls the year over in December", () => {
    expect(monthEnd(new Date("2026-12-05T00:00:00Z")).toISOString()).toBe(
      "2027-01-01T00:00:00.000Z",
    );
  });

  it("is stable for every instant within the same month", () => {
    const a = monthStart(new Date("2026-08-01T00:00:00Z"));
    const b = monthStart(new Date("2026-08-31T23:59:59Z"));
    expect(a.getTime()).toBe(b.getTime());
  });

  it("puts the very last instant of a month in that month's bucket", () => {
    expect(monthStart(new Date("2026-08-31T23:59:59.999Z")).toISOString()).toBe(
      "2026-08-01T00:00:00.000Z",
    );
  });
});

describe("allowances", () => {
  it("are generous enough that ordinary use never meets them", () => {
    // ~20 replies a day every day still sits inside the monthly ceiling.
    expect(MONTHLY_ALLOWANCE.chat).toBeGreaterThanOrEqual(600);
    expect(MONTHLY_ALLOWANCE.clone).toBeGreaterThanOrEqual(10);
  });
});
