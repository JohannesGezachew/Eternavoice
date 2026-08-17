"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

export type ConnectionState = "ok" | "slow" | "offline";

/**
 * How the line is holding up.
 *
 * A dropped stream used to surface as "Something went wrong. Tap retry." —
 * true, but useless. The three things that actually happen are different and
 * deserve different words: the network is gone, the reply is taking longer
 * than it should, or everything is fine.
 *
 * `stalledSince` is a timestamp the caller sets when it starts waiting on the
 * model and clears when the first token lands. Nothing polls the network; the
 * only cost is one timer while a reply is genuinely outstanding.
 */

function subscribeToNetwork(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

// navigator.onLine is only trustworthy in the negative — false genuinely means
// no interface, while true can still be a captive portal. The stall timer
// below is what catches that case.
const getOnline = () => navigator.onLine;
// The server has no opinion, and guessing "offline" would flash a warning
// through every first paint.
const getServerOnline = () => true;

export function useConnectionHealth(stalledSince: number | null, slowAfterMs = 7000) {
  const online = useSyncExternalStore(subscribeToNetwork, getOnline, getServerOnline);

  // Records *which* wait was found to be slow, rather than a bare boolean.
  // Reading the clock during render would be an impure call, and a boolean
  // would need clearing in an effect body; keying it to the timestamp means
  // `slow` falls back to false on its own the moment a new reply starts or the
  // current one lands.
  const [slowFor, setSlowFor] = useState<number | null>(null);
  useEffect(() => {
    if (stalledSince === null) return;
    const remaining = Math.max(0, slowAfterMs - (Date.now() - stalledSince));
    const t = setTimeout(() => setSlowFor(stalledSince), remaining);
    return () => clearTimeout(t);
  }, [stalledSince, slowAfterMs]);

  const slow = stalledSince !== null && slowFor === stalledSince;
  const state: ConnectionState = !online ? "offline" : slow ? "slow" : "ok";

  return {
    state,
    /** Said plainly, and never as though the user did something wrong. */
    message:
      state === "offline"
        ? "You're offline. They'll be here when you're back."
        : state === "slow"
          ? "Still thinking — the line is slow just now."
          : null,
  };
}
