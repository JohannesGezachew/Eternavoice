/**
 * Who appears on the people page.
 *
 * Archiving is the reversible middle between keeping someone on the shelf and
 * deleting them outright, and it only ever changes this: whether their card is
 * listed. Everything else about an archived person still works — they can be
 * opened, talked to, and unarchived.
 *
 * The rules live here rather than inline because the failure mode is silent and
 * total: read the column wrong and every person disappears from the library at
 * once, which for this product is indistinguishable from having lost them.
 */

/** Anything with the archive column — subject rows, or the local voice records
 *  from before someone signed in, which have no column at all. */
export interface Archivable {
  archived_at?: string | null;
}

/**
 * A row is archived only when the column holds a real timestamp. Rows written
 * before migration 008 have no such key, and the API may omit it entirely, so
 * "not present" has to mean "on the shelf" — the opposite default would empty
 * the page for everyone on the day this shipped.
 */
export function isArchived(person: Archivable | null | undefined): boolean {
  const at = person?.archived_at;
  return typeof at === "string" && at.trim().length > 0;
}

export function selectPeople<T extends Archivable>(
  people: T[],
  { includeArchived = false }: { includeArchived?: boolean } = {},
): T[] {
  return includeArchived ? people : people.filter((p) => !isArchived(p));
}

/** How many people the default view is holding back — the number the "Show"
 *  affordance is built around. */
export function countArchived(people: Archivable[]): number {
  return people.filter(isArchived).length;
}

/**
 * Plain words for corpus_quality_score, which the schema has carried since the
 * first migration and which nothing has ever shown the user.
 *
 * The column is an int and no writer exists yet, so 0–100 is the only reading
 * that makes sense of it. Anything outside that returns null rather than being
 * clamped into a confident-sounding label: telling someone their mother's voice
 * sample is "rough" on the strength of a misread scale is worse than saying
 * nothing, and saying nothing is exactly what the page did before.
 */
export function describeCorpusQuality(
  score: number | null | undefined,
): { label: string; score: number } | null {
  if (typeof score !== "number" || !Number.isFinite(score)) return null;
  if (score < 0 || score > 100) return null;
  const rounded = Math.round(score);
  const label =
    rounded >= 80 ? "Strong" : rounded >= 60 ? "Good" : rounded >= 40 ? "Usable" : "Rough";
  return { label, score: rounded };
}
