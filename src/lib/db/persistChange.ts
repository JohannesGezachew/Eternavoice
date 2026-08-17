"use client";

import { useSyncExternalStore } from "react";
import { withRetry } from "@/lib/retry";
import { reportError } from "@/lib/reportError";
import { isSessionExpired, SESSION_ENDED_MESSAGE } from "@/lib/authError";

/**
 * Optimistic edits that admit it when the database never agreed.
 *
 * Renaming, pinning, deleting a conversation and editing or deleting a memory
 * all changed the local store first and then wrote to Postgres with
 * `.catch(console.error)`. When that write failed the two quietly disagreed,
 * and the database won on the next load — so the rename reverted, the pin came
 * off, and a conversation the user had deleted came back.
 *
 * The last one is the one that matters. Someone deletes a conversation because
 * reading it again is more than they can carry today; they are shown that it is
 * gone; and then it is waiting for them tomorrow. Silence turns a network blip
 * into the app overruling a decision they made deliberately.
 *
 * So every one of those writes now retries, and if it still cannot land, the
 * local change is rolled back — the screen goes back to being true — and the
 * user is told, once, in plain words.
 */

export interface PersistChangeOptions {
  /** Where this came from, for the error report. */
  source: string;
  /** The write. Throwing means it did not land. */
  run: () => Promise<unknown>;
  /**
   * Undo the optimistic local change.
   *
   * Required, not optional. Reverting is the difference between telling
   * someone a save failed and leaving them looking at a screen that still
   * shows the change as though it had worked.
   */
  revert: () => void;
  /** What did not happen, in the user's terms: "delete that conversation". */
  describe: string;
}

/** A lapsed session fails identically every time; retrying just delays the
 *  only message that helps, which is "sign in again". */
const retryable = (error: unknown) => !isSessionExpired(error);

export async function persistChange({
  source,
  run,
  revert,
  describe,
}: PersistChangeOptions): Promise<boolean> {
  const result = await withRetry(run, { retryable });
  if (result.ok) {
    return true;
  }

  revert();
  reportError(source, result.error, { attempts: result.attempts });
  setSyncFailure(
    isSessionExpired(result.error)
      ? SESSION_ENDED_MESSAGE
      : `We couldn't ${describe} just now — the change has been undone. Check your connection and try again.`,
  );
  return false;
}

// Module state rather than React state, for the same reason storageQuota uses
// it: these calls fire from event handlers scattered across four screens, and
// threading an error channel through every one of them is how call sites end
// up back on .catch(console.error).
let failure: string | null = null;
const listeners = new Set<() => void>();

export function setSyncFailure(next: string | null): void {
  if (failure === next) return;
  failure = next;
  for (const listener of listeners) listener();
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

/** The current failure, for the banner and for tests. */
export const getSyncFailure = (): string | null => failure;

const getSnapshot = getSyncFailure;
const getServerSnapshot = (): string | null => null;

export function useSyncFailure(): {
  message: string | null;
  dismiss: () => void;
} {
  const message = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return { message, dismiss: () => setSyncFailure(null) };
}
