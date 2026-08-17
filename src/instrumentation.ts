/**
 * Runs once when the server starts, before it accepts a request.
 *
 * Every environment variable in this app was checked lazily, at the moment it
 * was first needed. For MASTER_ENCRYPTION_KEY that is the first field anyone
 * tries to encrypt — so a key of the wrong length was not a failed deploy but
 * a failed save, in production, in the middle of a conversation, for whichever
 * user happened to be first. A deployment that cannot work should not accept
 * traffic and pretend otherwise.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { validateServerEnv } = await import("@/lib/env");
  validateServerEnv();
}
