"use client";

/**
 * The app's small sonic identity. Three quiet, related tones built on the same
 * intervals so they feel like one instrument:
 *
 *   openingTone — a rising fifth as a session opens (the room coming alive)
 *   closingTone — a gentle falling fifth as it closes (a soft exhale)
 *   saveChime   — a brief two-note lift when something is kept
 *
 * All synthesised with the Web Audio API — no asset loading, no latency. Each
 * call opens a short-lived AudioContext and closes it when the tone ends.
 * Failures are swallowed: silence is an acceptable fallback for a chime.
 */

function withContext(play: (ctx: AudioContext, gain: GainNode) => void): void {
  try {
    const ctx = new AudioContext();
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(ctx.destination);
    play(ctx, gain);
  } catch {
    // audio unavailable — fine
  }
}

/** A quiet rising fifth (G4 → C5) — the room coming alive. */
export function openingTone(): void {
  withContext((ctx, gain) => {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.connect(gain);
    const t0 = ctx.currentTime;
    osc.frequency.setValueAtTime(392, t0);
    osc.frequency.linearRampToValueAtTime(523.25, t0 + 0.45);
    gain.gain.linearRampToValueAtTime(0.04, t0 + 0.18);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.2);
    osc.start(t0);
    osc.stop(t0 + 1.3);
    osc.onended = () => void ctx.close();
  });
}

/** A gentle falling fifth (C5 → G4) — a soft exhale as the session ends. */
export function closingTone(): void {
  withContext((ctx, gain) => {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.connect(gain);
    const t0 = ctx.currentTime;
    osc.frequency.setValueAtTime(523.25, t0);
    osc.frequency.linearRampToValueAtTime(392, t0 + 0.55);
    gain.gain.linearRampToValueAtTime(0.032, t0 + 0.12);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.1);
    osc.start(t0);
    osc.stop(t0 + 1.2);
    osc.onended = () => void ctx.close();
  });
}

/** A brief two-note lift (C5 → E5) — something has been kept. */
export function saveChime(): void {
  withContext((ctx, gain) => {
    const t0 = ctx.currentTime;
    const notes = [523.25, 659.25];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      g.gain.value = 0;
      osc.type = "sine";
      osc.frequency.value = freq;
      osc.connect(g);
      g.connect(ctx.destination);
      const start = t0 + i * 0.09;
      g.gain.linearRampToValueAtTime(0.05, start + 0.04);
      g.gain.exponentialRampToValueAtTime(0.0001, start + 0.5);
      osc.start(start);
      osc.stop(start + 0.55);
      if (i === notes.length - 1) osc.onended = () => void ctx.close();
    });
  });
}
