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

/**
 * Search, as a person actually remembers things.
 *
 * There was no way to find a memory. The list grows without limit — the
 * summariser captures on every conversation — so someone six months in has
 * hundreds, and the only way to check whether they had already written down
 * their father's birthday was to read the whole page.
 *
 * Every term must match somewhere, in any order, so "dad birthday" finds "his
 * birthday was the 3rd" under a memory scoped to Dad. Case and punctuation are
 * ignored, because nobody types a search the way they typed the note.
 */
export function searchMemories(memories: MemoryItem[], query: string): MemoryItem[] {
  const terms = normalise(query).split(" ").filter(Boolean);
  if (!terms.length) return memories;
  return memories.filter((memory) => {
    const haystack = normalise(memory.content);
    return terms.every((term) => haystack.includes(term));
  });
}

function normalise(value: string): string {
  return value
    .toLowerCase()
    // Apostrophes are removed, not replaced with a space: these notes are full
    // of possessives, and splitting "mum's" into "mum s" means a search for
    // "mums" finds nothing. Both curly and straight, since the app's own copy
    // uses curly and a keyboard produces straight.
    .replace(/['\u2018\u2019]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Memories that say the same thing twice.
 *
 * The summariser de-dupes on an exact lowercase match, which catches nothing
 * in practice: it writes in the persona's voice from a fresh transcript each
 * time, so the same fact comes back as "your birthday is the 3rd of June" and
 * then "you were born on the 3rd of June". Both are then fed to the model, and
 * a fact repeated three ways reads to it as a fact worth mentioning.
 *
 * Grouped rather than deleted. Which of two phrasings is the better record of
 * someone's father is not a decision code should be making silently — the page
 * shows the group and the user picks.
 *
 * Similarity is word overlap over the smaller of the two, so a short memory
 * fully contained in a longer one counts as a duplicate. Deliberately not a
 * character-level distance: "your mother" and "your brother" are one letter
 * apart and could not be less alike.
 */
export const DUPLICATE_THRESHOLD = 0.7;

export function findDuplicateGroups(memories: MemoryItem[]): MemoryItem[][] {
  const words = new Map<string, Set<string>>();
  for (const memory of memories) {
    words.set(memory.id, new Set(normalise(memory.content).split(" ").filter(Boolean)));
  }

  const groups: MemoryItem[][] = [];
  const claimed = new Set<string>();

  for (let i = 0; i < memories.length; i++) {
    const a = memories[i]!;
    if (claimed.has(a.id)) continue;
    const group = [a];
    for (let j = i + 1; j < memories.length; j++) {
      const b = memories[j]!;
      if (claimed.has(b.id)) continue;
      if (similarity(words.get(a.id)!, words.get(b.id)!) >= DUPLICATE_THRESHOLD) {
        group.push(b);
        claimed.add(b.id);
      }
    }
    if (group.length > 1) {
      claimed.add(a.id);
      groups.push(group);
    }
  }
  return groups;
}

function similarity(a: Set<string>, b: Set<string>): number {
  const smaller = a.size <= b.size ? a : b;
  const larger = smaller === a ? b : a;
  if (!smaller.size) return 0;
  let shared = 0;
  for (const word of smaller) if (larger.has(word)) shared++;
  return shared / smaller.size;
}
