import type { MemoryItem } from "./types";

/**
 * How memories are chosen for display.
 *
 * Two rules used to live inline in both the Memories page and MemoryList, and
 * they had to agree: a memory hidden in one place but shown in the other reads
 * as a bug. They live here so the "show what was remembered from talks" toggle
 * can only ever apply to both at once.
 *
 * The default is deliberate: the list is a record of what *you* chose to keep.
 * The summariser's auto-extracted memories are real and the persona uses them,
 * but they are not the user's own notes, so they stay out of the way until
 * someone asks for them.
 */
export interface MemorySelection {
  /** Scope to one person. `undefined` means every person; `null` means only
   *  the legacy unscoped notes from before memories were per-person. */
  subjectId?: string | null;
  /** Include the summariser's auto-extracted memories. Off by default. */
  includeAuto?: boolean;
}

function inScope(memory: MemoryItem, subjectId: string | null | undefined): boolean {
  if (subjectId === undefined) return true;
  // A legacy unscoped memory belongs to everyone, so it shows on every person.
  return memory.subjectId == null || memory.subjectId === subjectId;
}

export function selectMemories(
  memories: MemoryItem[],
  { subjectId, includeAuto = false }: MemorySelection = {},
): MemoryItem[] {
  return memories.filter(
    (memory) =>
      inScope(memory, subjectId) && (includeAuto || memory.source !== "conversation"),
  );
}

/** How many memories are being withheld by the default view — the number the
 *  "show everything" affordance is built around. */
export function countAutoMemories(
  memories: MemoryItem[],
  subjectId?: string | null,
): number {
  return memories.filter(
    (memory) => inScope(memory, subjectId) && memory.source === "conversation",
  ).length;
}

/** True when this turn is worth offering to keep. Filters out the "yeah" /
 *  "mhm" acknowledgements that make up a good share of a spoken conversation
 *  and would only ever produce noise memories. */
export function isRememberable(content: string | undefined): boolean {
  return (content ?? "").trim().length >= 15;
}
