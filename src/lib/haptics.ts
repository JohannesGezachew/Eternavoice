"use client";

/**
 * One vibration vocabulary for the whole app, so every tactile cue means the
 * same thing wherever it fires. Silently no-ops where vibration is unsupported
 * (desktop, iOS Safari) — never throws, never needs a capability check at the
 * call site.
 *
 *   tap       — a light acknowledgement (toggle, select)
 *   begin     — a session opens (slightly weightier)
 *   interrupt — the user barged in / stopped the voice
 *   save      — something was kept (memory, clip)
 *   error     — a failure the user should feel
 */
export type HapticPattern = "tap" | "begin" | "interrupt" | "save" | "error";

const PATTERNS: Record<HapticPattern, number | number[]> = {
  tap: 8,
  begin: 14,
  interrupt: [0, 6, 40, 10],
  save: [0, 10, 30, 18],
  error: [0, 30, 40, 30],
};

export function haptic(pattern: HapticPattern = "tap"): void {
  try {
    navigator.vibrate?.(PATTERNS[pattern]);
  } catch {
    // unsupported — silence is the correct fallback
  }
}
