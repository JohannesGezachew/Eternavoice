import { describe, it, expect } from "vitest";
import { safeInternalPath, clamp, formatSeconds, cn } from "./utils";

/**
 * safeInternalPath is a security control, not a formatting helper: it is what
 * stops `?next=` on the login and auth-callback routes from bouncing a freshly
 * authenticated user to an attacker's site. These cases are the contract.
 */
describe("safeInternalPath (open-redirect guard)", () => {
  it("keeps ordinary internal paths", () => {
    expect(safeInternalPath("/people")).toBe("/people");
    expect(safeInternalPath("/people/123/talk")).toBe("/people/123/talk");
    expect(safeInternalPath("/memories?filter=all")).toBe("/memories?filter=all");
  });

  it("rejects absolute URLs to another origin", () => {
    expect(safeInternalPath("https://evil.com")).toBe("/people");
    expect(safeInternalPath("http://evil.com/steal")).toBe("/people");
  });

  it("rejects protocol-relative URLs", () => {
    // "//evil.com" is a live cross-origin navigation in a browser.
    expect(safeInternalPath("//evil.com")).toBe("/people");
    expect(safeInternalPath("//evil.com/path")).toBe("/people");
  });

  it("rejects backslash-smuggled paths", () => {
    // Some browsers normalise "/\" to "//", making this cross-origin too.
    expect(safeInternalPath("/\\evil.com")).toBe("/people");
  });

  it("falls back on empty, null and undefined", () => {
    expect(safeInternalPath(null)).toBe("/people");
    expect(safeInternalPath(undefined)).toBe("/people");
    expect(safeInternalPath("")).toBe("/people");
  });

  it("rejects anything not rooted at /", () => {
    expect(safeInternalPath("people")).toBe("/people");
    expect(safeInternalPath("javascript:alert(1)")).toBe("/people");
  });

  it("honours a custom fallback", () => {
    expect(safeInternalPath("https://evil.com", "/")).toBe("/");
  });
});

describe("clamp", () => {
  it("bounds values to the range", () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-3, 0, 10)).toBe(0);
    expect(clamp(99, 0, 10)).toBe(10);
  });
});

describe("formatSeconds", () => {
  it("formats as m:ss with a padded seconds field", () => {
    expect(formatSeconds(0)).toBe("0:00");
    expect(formatSeconds(9)).toBe("0:09");
    expect(formatSeconds(75)).toBe("1:15");
  });
});

describe("cn", () => {
  it("joins truthy class names and drops falsy ones", () => {
    expect(cn("a", false, null, undefined, "b")).toBe("a b");
  });
});
