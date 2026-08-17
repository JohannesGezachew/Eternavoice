/**
 * "Your session ended" is not "something went wrong".
 *
 * When a Supabase session lapses every route starts answering 401 and the
 * client showed the same "Something went wrong. Tap retry." it shows for a
 * dropped packet. So the one action that fixes it — sign in again — was the
 * one thing never offered, and Retry could only ever fail again.
 *
 * No imports: this is read on both sides of the network boundary.
 */

/** Said plainly, and without implying they lost anything. */
export const SESSION_ENDED_MESSAGE =
  "Your session has ended. Sign in again — everything is where you left it.";

export class SessionExpiredError extends Error {
  constructor() {
    super("session_expired");
    this.name = "SessionExpiredError";
  }
}

/**
 * The only status that means "we don't know who you are". 403 is deliberately
 * excluded: that is "we know, and this isn't yours" (see assertVoiceOwner),
 * and signing in again would not change it.
 */
export function isUnauthorizedStatus(status: number): boolean {
  return status === 401;
}

/**
 * Whether a caught failure is a lapsed session.
 *
 * Matches the exact "Unauthorized" that the server actions in lib/db throw,
 * not merely a message containing the word — "That voice isn't yours" and any
 * provider text mentioning authorization must not route someone to a login
 * page they do not need.
 *
 * NOTE: in production Next.js replaces a Server Action's thrown error with an
 * opaque digest, so this cannot see through that boundary. That is why the
 * conversation save returns an outcome instead of throwing.
 */
export function isSessionExpired(error: unknown): boolean {
  if (error instanceof SessionExpiredError) return true;
  if (!error || typeof error !== "object") return false;
  const { name, message } = error as { name?: unknown; message?: unknown };
  if (name === "SessionExpiredError") return true;
  return typeof message === "string" && message.trim().toLowerCase() === "unauthorized";
}
