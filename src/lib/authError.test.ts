import { describe, it, expect } from "vitest";
import {
  SessionExpiredError,
  isSessionExpired,
  isUnauthorizedStatus,
  SESSION_ENDED_MESSAGE,
} from "./authError";

/**
 * Two ways to get this wrong, both of which the app did.
 *
 * Miss it, and a lapsed session reads as "Something went wrong. Tap retry." —
 * a retry that cannot work, and no mention of the one thing that fixes it.
 * Over-match it, and someone reaching a voice that isn't theirs gets bounced
 * to a sign-in page while already perfectly signed in.
 */

describe("isUnauthorizedStatus", () => {
  it("is 401 and nothing else", () => {
    expect(isUnauthorizedStatus(401)).toBe(true);
    // 403 is "we know who you are, and this isn't yours" — assertVoiceOwner's
    // cross-tenant refusal. Signing in again changes nothing about it.
    expect(isUnauthorizedStatus(403)).toBe(false);
    // 402 is the entitlement gate; the client routes that to /subscribe.
    expect(isUnauthorizedStatus(402)).toBe(false);
    for (const s of [200, 400, 404, 429, 500]) {
      expect(isUnauthorizedStatus(s)).toBe(false);
    }
  });
});

describe("isSessionExpired", () => {
  it("recognises the typed error the stream helpers throw", () => {
    expect(isSessionExpired(new SessionExpiredError())).toBe(true);
  });

  it("recognises it across a boundary that kept only name and message", () => {
    expect(isSessionExpired({ name: "SessionExpiredError", message: "session_expired" })).toBe(true);
  });

  it("recognises the bare Unauthorized the db server actions throw", () => {
    expect(isSessionExpired(new Error("Unauthorized"))).toBe(true);
    expect(isSessionExpired(new Error("  unauthorized  "))).toBe(true);
  });

  it("does not claim a session ended just because a message mentions authorization", () => {
    expect(isSessionExpired(new Error("That voice isn't yours."))).toBe(false);
    expect(isSessionExpired(new Error("Unauthorized voice for this subject"))).toBe(false);
    expect(isSessionExpired(new Error("unauthorized_client"))).toBe(false);
  });

  it("is safe on anything at all", () => {
    expect(isSessionExpired(null)).toBe(false);
    expect(isSessionExpired(undefined)).toBe(false);
    expect(isSessionExpired("Unauthorized")).toBe(false);
    expect(isSessionExpired(401)).toBe(false);
  });
});

describe("the message itself", () => {
  it("never suggests anything was lost", () => {
    expect(SESSION_ENDED_MESSAGE).toMatch(/where you left it/i);
    expect(SESSION_ENDED_MESSAGE).not.toMatch(/error|failed|wrong/i);
  });
});
