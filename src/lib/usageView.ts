// Type-only: rateLimit.ts is "server-only" and builds a service-role client at
// call time. The type is erased at compile time, so the account page — a client
// component — can share the vocabulary without pulling the module in.
import type { AllowanceScope } from "./rateLimit";

/**
 * How this month's allowance is presented on the account screen.
 *
 * The allowances exist as a cost ceiling nobody should feel (see the comment on
 * MONTHLY_ALLOWANCE), so the rules here are about restraint: each scope reads
 * as a plain "12 of 600" line, and only starts drawing attention once it is
 * genuinely close to the ceiling. Anything louder turns a page people open
 * while grieving into a metered utility bill.
 *
 * The arithmetic lives here rather than in the page because the failure modes
 * are the invisible kind — a meter overflowing its track, a NaN width, a used
 * count above the limit — and they only ever appear for the person who has
 * already run out, which is the worst moment to look broken.
 */

/** Above this fraction of the allowance, and not before, a line is emphasised. */
export const EMPHASIS_THRESHOLD = 0.8;

export interface Allowance {
  used: number;
  limit: number;
  fraction: number;
  resetsAt: string;
}

export type UsageSnapshot = Partial<Record<AllowanceScope, Allowance | null>>;

export interface AllowanceLine {
  scope: AllowanceScope;
  /** Plain language for what is counted, not the API scope name. */
  label: string;
  /** The same thing mid-sentence: "you've used this month's spoken replies". */
  noun: string;
  used: number;
  limit: number;
  /** 0–100, clamped — the meter's width. */
  percent: number;
  /** True once usage is high enough to be worth mentioning. */
  emphasised: boolean;
  /** True when there is nothing left this month. */
  spent: boolean;
  resetsAt: string;
}

// Only the scopes worth showing someone. tts, transcribe, personaExtract and
// summarise are cost controls on machinery — replaying a line, voice input,
// building a persona — that nobody thinks of as a quota they spend. Metering
// them on screen would invite counting, which is the opposite of the point.
const LABELS: Partial<Record<AllowanceScope, string>> = {
  chat: "Spoken replies",
  reading: "Readings",
  clone: "Voices created",
};

const NOUNS: Partial<Record<AllowanceScope, string>> = {
  chat: "spoken replies",
  reading: "readings",
  clone: "new voices",
};

/** Headline first, rarest last — the order someone would ask about them in. */
const ORDER: AllowanceScope[] = ["chat", "reading", "clone"];

/**
 * Turn whatever /api/usage returned into lines to render.
 *
 * Deliberately tolerant: the endpoint is advisory and may be older than this
 * page, so a missing or nonsensical scope drops its line instead of rendering
 * "NaN / 0".
 */
export function usageLines(snapshot: UsageSnapshot | null | undefined): AllowanceLine[] {
  if (!snapshot) return [];
  const lines: AllowanceLine[] = [];

  for (const scope of ORDER) {
    const allowance = snapshot[scope];
    if (!allowance) continue;

    const limit = allowance.limit;
    if (!Number.isFinite(limit) || limit <= 0) continue;

    // A scope with no label is machinery, not a quota anyone should see.
    const label = LABELS[scope];
    const noun = NOUNS[scope];
    if (!label || !noun) continue;

    const used = Number.isFinite(allowance.used) ? Math.max(0, allowance.used) : 0;
    // Recomputed rather than trusted: a stale fraction served against a changed
    // limit would emphasise the wrong scope.
    const fraction = used / limit;

    lines.push({
      scope,
      label,
      noun,
      // The allowance check fails open, so the counter keeps climbing past the
      // ceiling. Showing "612 of 600" would only ever read as a billing error.
      used: Math.min(used, limit),
      limit,
      percent: Math.round(Math.min(1, fraction) * 100),
      emphasised: fraction > EMPHASIS_THRESHOLD,
      spent: used >= limit,
      resetsAt: allowance.resetsAt,
    });
  }

  return lines;
}

/** "on 1 September" — a date, not a countdown. Nothing about an allowance is
 *  urgent enough to deserve a ticking clock. */
export function formatResetDate(iso: string | null | undefined): string {
  if (!iso) return "next month";
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return "next month";
  return `on ${when.toLocaleDateString("en-GB", { day: "numeric", month: "long" })}`;
}
