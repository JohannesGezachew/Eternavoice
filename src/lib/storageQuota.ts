"use client";

import { useSyncExternalStore } from "react";

/**
 * localStorage that admits when it is full.
 *
 * zustand's persist middleware catches whatever setItem throws and carries on,
 * so a browser that has hit its quota simply stops writing and says nothing.
 * The user goes on talking while this device quietly keeps none of it.
 *
 * Nothing is actually lost — the database is the record and DbHydrator refills
 * people, conversations and memories on every load — so the point of surfacing
 * this is not alarm. It is that "your phone has run out of room" is a thing a
 * person can act on, and silence is not.
 */

/**
 * Is this the browser saying the store is full?
 *
 * Every engine spells it differently: Chrome and Safari raise a DOMException
 * named QuotaExceededError (code 22), older Safari used QUOTA_EXCEEDED_ERR,
 * and Firefox raises NS_ERROR_DOM_QUOTA_REACHED (code 1014). Matching on the
 * name alone missed Firefox entirely, which is exactly the browser most likely
 * to be running with a small quota.
 */
const QUOTA_NAMES = new Set([
  "QuotaExceededError",
  "QUOTA_EXCEEDED_ERR",
  "NS_ERROR_DOM_QUOTA_REACHED",
]);

export function isQuotaExceeded(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const { name, code } = error as { name?: unknown; code?: unknown };
  if (typeof name === "string" && QUOTA_NAMES.has(name)) return true;
  // The numeric codes are only meaningful on a DOM exception, so require the
  // shape rather than treating any object with a `code: 22` as a full disk.
  if (typeof name !== "string") return false;
  return code === 22 || code === 1014;
}

/**
 * Wrap a Storage so a quota failure becomes a signal instead of a swallowed
 * throw. Everything else passes through untouched.
 *
 * A quota error is deliberately NOT rethrown: persist would swallow it anyway,
 * and letting it escape would take a conversation down over a cache write.
 * Anything else — a SecurityError from a blocked origin, say — still throws,
 * because pretending to have handled it would hide a different problem.
 */
/**
 * How long writes are held before hitting the disk.
 *
 * zustand's persist writes on every single `set()`, synchronously. A five
 * sentence reply produces roughly fifteen of them — one per streamed sentence,
 * one per audio chunk, plus the status transitions — and each one serialises
 * the whole persisted slice and blocks the main thread on a disk write. That
 * lands squarely between sentences, while two animation-frame loops are trying
 * to hold 60fps and decodeAudioData is trying to schedule gapless audio.
 *
 * Trailing-edge, so a burst collapses to one write once it settles.
 */
const WRITE_DELAY_MS = 600;

export function quotaAwareStorage(
  base: Storage,
  onFull: (full: boolean) => void,
): Storage {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: { key: string; value: string } | null = null;

  const flush = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    const write = pending;
    pending = null;
    if (write) commit(write.key, write.value);
  };

  const commit = (key: string, value: string) => {
    try {
      base.setItem(key, value);
      onFull(false);
    } catch (error) {
      if (!isQuotaExceeded(error)) throw error;
      onFull(true);
    }
  };

  // A tab closing mid-debounce would otherwise lose the last write. This is
  // the one moment the synchronous cost is worth paying.
  if (typeof window !== "undefined") {
    window.addEventListener("pagehide", flush);
    window.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") flush();
    });
  }

  return {
    get length() {
      return base.length;
    },
    key: (index) => base.key(index),
    // Reads must see the pending write, or a reload during the debounce
    // window would rehydrate from a version that is already stale.
    getItem: (key) => (pending?.key === key ? pending.value : base.getItem(key)),
    removeItem: (key) => {
      if (pending?.key === key) pending = null;
      base.removeItem(key);
    },
    clear: () => {
      pending = null;
      base.clear();
    },
    setItem(key, value) {
      pending = { key, value };
      if (timer) clearTimeout(timer);
      timer = setTimeout(flush, WRITE_DELAY_MS);
    },
  };
}

// The live flag, shared by every screen. Module state rather than React state
// because the writer is zustand's persist middleware, which runs outside the
// render tree entirely — useSyncExternalStore is the supported way across.
let storageFull = false;
const listeners = new Set<() => void>();

export function setStorageFull(next: boolean): void {
  if (storageFull === next) return;
  storageFull = next;
  for (const listener of listeners) listener();
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

const getSnapshot = () => storageFull;
// The server has no localStorage. Guessing "full" would flash a warning
// through the first paint of every page.
const getServerSnapshot = () => false;

/** Said as a fact about the device, not a failure of theirs. */
export const STORAGE_FULL_MESSAGE =
  "This device has run out of room, so it's stopped keeping its own copy. Everything is still saved to your account.";

export function useStorageHealth(): { full: boolean; message: string | null } {
  const full = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return { full, message: full ? STORAGE_FULL_MESSAGE : null };
}
