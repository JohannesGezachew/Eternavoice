/**
 * Shaping the persona-extraction model's output.
 *
 * This lived inside the route file, which exported it. A Next.js route module
 * may only export route handlers and route config — Turbopack tolerates the
 * extra export, but `next build --webpack` rejects it outright, so the project
 * silently could not be built with the other bundler. Moving it here also
 * means the tests import a plain module rather than reaching into a route.
 */

import { z } from "zod";

/**
 * What the model returns. Deliberately permissive about LENGTH and COUNT: the
 * prompt asks for short memories and a handful of them, but models overshoot,
 * and a strict `.max()` here would throw — costing the user their whole
 * narration over a few extra characters. Over-long output is trimmed in
 * shapeExtraction instead, so a verbose model degrades rather than fails.
 */
const Extracted = z.object({
  description: z.string().optional(),
  relationship: z.string().optional(),
  catchphrases: z.string().optional(),
  speechStyle: z
    .object({
      warmth: z.number(),
      directness: z.number(),
      expressiveness: z.number(),
      humor: z.number(),
      talkativeness: z.number(),
    })
    .partial()
    .optional(),
  memories: z.array(z.string()).optional(),
});

const clamp = (n: unknown, fallback = 5): number => {
  const v = typeof n === "number" && Number.isFinite(n) ? n : fallback;
  return Math.min(10, Math.max(0, Math.round(v)));
};

/** Trim to a limit without slicing a word in half. */
function trim(value: string | undefined, max: number): string | undefined {
  const text = value?.trim();
  if (!text) return undefined;
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trim();
}

export interface ShapedExtraction {
  persona: {
    description?: string;
    relationship?: string;
    catchphrases?: string;
    speechStyle: {
      warmth: number;
      directness: number;
      expressiveness: number;
      humor: number;
      talkativeness: number;
    };
  };
  memories: string[];
}

/**
 * Normalise raw model output into the persona the wizard persists. Exported so
 * the failure modes that matter — over-long fields, too many memories, missing
 * or non-numeric dials, junk — are covered by tests without calling OpenAI.
 */
export function shapeExtraction(raw: unknown, isSelf: boolean): ShapedExtraction {
  const parsed = Extracted.parse(raw);
  return {
    persona: {
      description: trim(parsed.description, 600),
      relationship: isSelf ? undefined : trim(parsed.relationship, 120),
      catchphrases: trim(parsed.catchphrases, 600),
      speechStyle: {
        warmth: clamp(parsed.speechStyle?.warmth),
        directness: clamp(parsed.speechStyle?.directness),
        expressiveness: clamp(parsed.speechStyle?.expressiveness),
        humor: clamp(parsed.speechStyle?.humor),
        talkativeness: clamp(parsed.speechStyle?.talkativeness),
      },
    },
    memories: (parsed.memories ?? [])
      .map((m) => trim(m, 240))
      .filter((m): m is string => Boolean(m))
      .slice(0, 10),
  };
}
