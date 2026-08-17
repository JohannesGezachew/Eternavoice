/**
 * Choosing which memories reach the persona.
 *
 * There is a hard ceiling on how many can go into a prompt, and the old rule
 * was "most recently updated wins". That sounds neutral and isn't: the
 * summariser writes up to twenty memories every eight turns, so auto-extracted
 * facts saturate any recency window within a single conversation. The notes
 * someone deliberately wrote — the ones they tapped a bookmark to keep — are
 * older by definition and were pushed out entirely.
 *
 * Two rules fix it. Anything a person kept by hand is always carried. The
 * remaining room goes to the auto-captured facts that have something to do
 * with what is being talked about right now, rather than merely the newest.
 */

export interface RankableMemory {
  content: string;
  source?: "manual" | "conversation";
  updatedAt?: number;
}

/** Words too common to say anything about what a memory is about. */
const STOP_WORDS = new Set([
  "the", "and", "you", "your", "yours", "was", "were", "with", "that", "this",
  "have", "has", "had", "for", "are", "our", "their", "them", "they", "she",
  "her", "his", "him", "but", "not", "all", "any", "can", "could", "would",
  "about", "when", "what", "who", "how", "why", "there", "here", "from",
  "just", "like", "been", "into", "some", "than", "then", "very", "much",
  "one", "two", "get", "got", "out", "off", "own", "way", "say", "said",
  "told", "tell", "know", "knew", "think", "thought", "always", "never",
]);

function keywords(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s'-]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP_WORDS.has(w)),
  );
}

/**
 * Score an auto-captured memory against what is currently being discussed.
 * Overlap is normalised by the memory's own length so a rambling one doesn't
 * outrank a precise one just by containing more words.
 */
function relevance(memory: string, context: Set<string>): number {
  if (!context.size) return 0;
  const words = keywords(memory);
  if (!words.size) return 0;
  let hits = 0;
  for (const w of words) if (context.has(w)) hits++;
  return hits / Math.sqrt(words.size);
}

export interface RankedSelection<T> {
  selected: T[];
  /** How many were left out, so the count can be shown honestly. */
  omitted: number;
}

/**
 * Pick the memories to carry into a reply.
 *
 * `recentText` is whatever the conversation has been about lately — the last
 * few turns is plenty. With no context to go on this degrades to recency,
 * which is the old behaviour and a reasonable floor.
 */
export function rankMemoriesForPrompt<T extends RankableMemory>(
  memories: T[],
  recentText: string,
  limit: number,
): RankedSelection<T> {
  const byRecency = (a: T, b: T) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0);

  // Legacy rows carry no source and were hand-written before the summariser
  // existed, so anything not explicitly "conversation" counts as kept.
  const kept = memories.filter((m) => m.source !== "conversation").sort(byRecency);
  const auto = memories.filter((m) => m.source === "conversation");

  if (kept.length >= limit) {
    return { selected: kept.slice(0, limit), omitted: memories.length - limit };
  }

  const context = keywords(recentText);
  const room = limit - kept.length;

  const rankedAuto = auto
    .map((memory) => ({ memory, score: relevance(memory.content, context) }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return byRecency(a.memory, b.memory);
    })
    .slice(0, room)
    .map((entry) => entry.memory);

  const selected = [...kept, ...rankedAuto];
  return { selected, omitted: Math.max(0, memories.length - selected.length) };
}
