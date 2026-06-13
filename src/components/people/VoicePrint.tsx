import { cn } from "@/lib/utils";

/**
 * Generative voiceprint — each person's visual signature, derived
 * deterministically from their voice id + name. A radial waveform ring whose
 * harmonics are unique per person: Margaret's presence looks like Margaret's
 * and like no one else's. Replaces the generic initial-in-a-circle.
 *
 * Pure render (no hooks, no browser APIs) — safe in server components.
 */

function hashSeed(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Closed radial-waveform path for one harmonic layer. */
function ringPath(
  rand: () => number,
  baseRadius: number,
  wobble: number,
  cx: number,
  cy: number,
): string {
  const harmonics = [
    { k: 3 + Math.floor(rand() * 3), a: 0.45 + rand() * 0.3, p: rand() * Math.PI * 2 },
    { k: 6 + Math.floor(rand() * 4), a: 0.25 + rand() * 0.25, p: rand() * Math.PI * 2 },
    { k: 11 + Math.floor(rand() * 6), a: 0.12 + rand() * 0.18, p: rand() * Math.PI * 2 },
  ];
  const points = 144;
  let d = "";
  for (let i = 0; i <= points; i++) {
    const theta = (i / points) * Math.PI * 2;
    let offset = 0;
    for (const { k, a, p } of harmonics) offset += a * Math.sin(k * theta + p);
    const r = baseRadius * (1 + wobble * offset);
    const x = cx + r * Math.cos(theta);
    const y = cy + r * Math.sin(theta);
    d += (i === 0 ? "M" : "L") + x.toFixed(2) + " " + y.toFixed(2);
  }
  return d + "Z";
}

interface VoicePrintProps {
  /** Stable identity input — voiceId (preferred) plus name. */
  seed: string;
  /** Rendered box size in px. Pass 0 to size via className instead. */
  size?: number;
  /** Letter rendered at the centre (usually the person's initial). */
  initial?: string;
  /** Slow idle rotation of the outer ring. */
  animated?: boolean;
  className?: string;
}

export function VoicePrint({ seed, size = 56, initial, animated = true, className }: VoicePrintProps) {
  const rand = mulberry32(hashSeed(seed));
  const C = 50;
  const outer = ringPath(rand, 38, 0.085, C, C);
  const mid = ringPath(rand, 30, 0.13, C, C);
  const inner = ringPath(rand, 21, 0.1, C, C);
  // Per-person rotation period so side-by-side prints never sync up.
  const period = 70 + Math.floor(rand() * 50);

  return (
    <div
      className={cn("relative shrink-0", className)}
      style={size ? { width: size, height: size } : undefined}
      aria-hidden
    >
      {/* Soft brand glow behind the signature */}
      <div
        className="absolute inset-[-22%] rounded-full opacity-60 blur-[14px]"
        style={{ background: "radial-gradient(closest-side, rgba(194,120,74,0.28), transparent 75%)" }}
      />
      <svg
        viewBox="0 0 100 100"
        className="absolute inset-0 h-full w-full"
        style={animated ? { animation: `vpSpin ${period}s linear infinite` } : undefined}
      >
        <path d={outer} fill="none" stroke="var(--color-ember)" strokeOpacity="0.55" strokeWidth="1.1" />
        <path d={mid} fill="none" stroke="var(--color-ember)" strokeOpacity="0.3" strokeWidth="0.9" />
        <path d={inner} fill="rgba(194,120,74,0.12)" stroke="var(--color-ember)" strokeOpacity="0.18" strokeWidth="0.7" />
      </svg>
      {initial ? (
        <span
          className="absolute inset-0 flex items-center justify-center font-serif text-[var(--color-ember)]"
          style={{ fontSize: size * 0.38 }}
        >
          {initial}
        </span>
      ) : null}
    </div>
  );
}
