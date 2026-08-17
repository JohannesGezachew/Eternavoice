"use client";

import { useSyncFailure } from "@/lib/db/persistChange";

/**
 * A change was rolled back because it never reached the database.
 *
 * Louder than the storage notice and dismissible, because this one is about
 * something the user did that did not happen — most of all a delete, where
 * silence would leave a conversation they chose to remove waiting for them
 * again tomorrow.
 *
 * Rendered by AppShell for every ordinary page, and separately by the talk
 * room, which has no shell of its own and is where three of these writes fire.
 */
export function SyncNotice({ floating = false }: { floating?: boolean }) {
  const { message, dismiss } = useSyncFailure();
  if (!message) return null;

  return (
    <div
      role="alert"
      className={
        floating
          ? "pointer-events-auto fixed inset-x-3 top-[calc(env(safe-area-inset-top)+4.5rem)] z-40 mx-auto flex max-w-md items-start gap-3 rounded-xl border border-[var(--color-danger)]/30 bg-[var(--color-ink-2)]/95 px-4 py-3 backdrop-blur-xl"
          : "flex items-start gap-3 border-b border-[var(--color-danger)]/25 bg-[var(--color-danger)]/[0.07] px-4 py-2.5 sm:px-6"
      }
    >
      <p className="flex-1 text-small leading-[1.5] text-[var(--color-bone)]/85">
        {message}
      </p>
      <button
        type="button"
        onClick={dismiss}
        className="shrink-0 cursor-pointer rounded-lg px-2 py-0.5 text-small text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-bone)]"
      >
        Dismiss
      </button>
    </div>
  );
}
