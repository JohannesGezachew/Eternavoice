import type { ChatTurn, ConversationRecord } from "./types";

/**
 * Shared, pure helpers for presenting past conversations.
 *
 * The history list, the in-talk sheet and the all-conversations page all read
 * from here, so a conversation is titled, grouped and searched identically
 * wherever it appears.
 */

export const AUTO_TITLE_FALLBACK = "New conversation";

/**
 * The title a conversation gets before anything better exists: the opening
 * words, trimmed.
 *
 * Kept as one function used by both the client store and the summariser,
 * because the summariser compares the stored title against this to work out
 * whether a human has since renamed it.
 */
/** One turn, shortened to title length. */
function titleFromContent(content: string): string {
  const clean = content.replace(/\s+/g, " ").trim();
  return clean.length > 64 ? `${clean.slice(0, 61)}...` : clean;
}

export function autoTitleFromTurns(
  turns: Array<Pick<ChatTurn, "role" | "content">>,
): string {
  const firstUser = turns.find((turn) => turn.role === "user" && turn.content.trim());
  const source = firstUser?.content ?? turns.find((turn) => turn.content.trim())?.content;
  if (!source) return AUTO_TITLE_FALLBACK;
  return titleFromContent(source);
}

/**
 * Whether a stored title is still one we generated, and therefore safe to
 * replace with something better.
 *
 * Any title that is just the opening words of *some* turn counts as generated.
 * That matters twice over: the first save happens while only the persona's
 * greeting exists, so conversations ended up named after the greeting; and the
 * derived title changes once the person replies. Matching against every turn
 * covers both, and lets conversations titled that way before this existed pick
 * up a real name on their next summarise instead of staying "Hey, Safa."
 *
 * Renaming is a deliberate act, so anything that matches no turn is left alone.
 */
export function isAutoTitle(
  storedTitle: string | null | undefined,
  turns: Array<Pick<ChatTurn, "role" | "content">>,
): boolean {
  const stored = (storedTitle ?? "").trim();
  if (!stored || stored === AUTO_TITLE_FALLBACK) return true;
  if (stored === autoTitleFromTurns(turns)) return true;
  return turns.some((turn) => turn.content.trim() && titleFromContent(turn.content) === stored);
}

/** Tidy a model-written title into something that fits a single line. */
export function normaliseTitle(raw: string | null | undefined): string | null {
  const clean = (raw ?? "")
    .replace(/\s+/g, " ")
    .replace(/^["'“”‘’]+|["'“”‘’.]+$/g, "")
    .trim();
  if (clean.length < 2) return null;
  return clean.length > 60 ? `${clean.slice(0, 57).trimEnd()}…` : clean;
}

// ── Grouping ────────────────────────────────────────────────────────────────

export type TimeBucket = "Pinned" | "Today" | "Yesterday" | "This week" | "This month" | "Earlier";

const DAY_MS = 86_400_000;

/** Midnight-relative day difference, so "yesterday" means the calendar day. */
function daysApart(then: number, now: number): number {
  const a = new Date(now);
  a.setHours(0, 0, 0, 0);
  const b = new Date(then);
  b.setHours(0, 0, 0, 0);
  return Math.round((a.getTime() - b.getTime()) / DAY_MS);
}

export function bucketFor(updatedAt: number, now = Date.now()): Exclude<TimeBucket, "Pinned"> {
  const days = daysApart(updatedAt, now);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return "This week";
  if (days < 31) return "This month";
  return "Earlier";
}

export interface ConversationGroup {
  bucket: TimeBucket;
  conversations: ConversationRecord[];
}

/**
 * Group for scanning: pinned first as their own section, then by recency.
 *
 * People come back to this list looking for a particular day — an anniversary,
 * a birthday, the evening something was said — so time is the organising axis,
 * not a flat scroll.
 */
export function groupConversations(
  conversations: ConversationRecord[],
  now = Date.now(),
): ConversationGroup[] {
  const order: TimeBucket[] = ["Pinned", "Today", "Yesterday", "This week", "This month", "Earlier"];
  const groups = new Map<TimeBucket, ConversationRecord[]>();

  for (const conversation of conversations) {
    const bucket: TimeBucket = conversation.pinned
      ? "Pinned"
      : bucketFor(conversation.updatedAt, now);
    const list = groups.get(bucket);
    if (list) list.push(conversation);
    else groups.set(bucket, [conversation]);
  }

  return order
    .filter((bucket) => groups.get(bucket)?.length)
    .map((bucket) => ({
      bucket,
      conversations: [...groups.get(bucket)!].sort((a, b) => b.updatedAt - a.updatedAt),
    }));
}

// ── Search ──────────────────────────────────────────────────────────────────

/**
 * Search titles *and* what was actually said.
 *
 * Every turn is already in memory, so searching only titles would be a choice
 * to withhold the useful half — people come looking for a sentence, not a
 * heading.
 */
export function searchConversations(
  conversations: ConversationRecord[],
  query: string,
): ConversationRecord[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return conversations;
  return conversations.filter((conversation) => {
    if (conversation.title.toLowerCase().includes(needle)) return true;
    return conversation.turns.some((turn) => turn.content.toLowerCase().includes(needle));
  });
}

/**
 * The first line of a turn that matches, so a search result shows *why* it
 * matched rather than making someone open it to find out.
 */
export function matchingSnippet(
  conversation: ConversationRecord,
  query: string,
  maxLength = 90,
): string | null {
  const needle = query.trim().toLowerCase();
  if (!needle) return null;
  const turn = conversation.turns.find((t) => t.content.toLowerCase().includes(needle));
  if (!turn) return null;
  const content = turn.content.replace(/\s+/g, " ").trim();
  const at = content.toLowerCase().indexOf(needle);
  // Open a window around the hit rather than always starting from the top.
  const start = Math.max(0, at - Math.floor((maxLength - needle.length) / 2));
  const slice = content.slice(start, start + maxLength);
  return `${start > 0 ? "…" : ""}${slice}${start + maxLength < content.length ? "…" : ""}`;
}

// ── Summary line ────────────────────────────────────────────────────────────

/**
 * What a conversation looks like at a glance.
 *
 * "12 turns" was jargon — nobody thinks in turns — so this leads with the last
 * thing that was said, which is what actually identifies a conversation.
 */
export function lastSpokenLine(conversation: ConversationRecord, maxLength = 90): string | null {
  for (let i = conversation.turns.length - 1; i >= 0; i--) {
    const content = conversation.turns[i]?.content.replace(/\s+/g, " ").trim();
    if (content) {
      return content.length > maxLength ? `${content.slice(0, maxLength - 1).trimEnd()}…` : content;
    }
  }
  return null;
}

/** Clock time, for telling apart two conversations held on the same day. */
export function formatTimeOfDay(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}
