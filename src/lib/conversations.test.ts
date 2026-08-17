import { describe, it, expect } from "vitest";
import {
  autoTitleFromTurns,
  isAutoTitle,
  normaliseTitle,
  bucketFor,
  groupConversations,
  searchConversations,
  matchingSnippet,
  lastSpokenLine,
  AUTO_TITLE_FALLBACK,
} from "./conversations";
import type { ChatTurn, ConversationRecord } from "./types";

function turn(role: "user" | "assistant", content: string): ChatTurn {
  return { id: `${role}-${content.slice(0, 8)}`, role, content, createdAt: 0 };
}

function conversation(partial: Partial<ConversationRecord> & { id: string }): ConversationRecord {
  return {
    voiceId: "v1",
    voiceName: "Mum",
    subjectId: "mum",
    title: "Untitled",
    persona: { mode: "persona", name: "Mum" },
    turns: [],
    createdAt: 0,
    updatedAt: 0,
    ...partial,
  };
}

const NOW = Date.parse("2026-08-17T12:00:00Z");
const daysAgo = (n: number) => NOW - n * 86_400_000;

describe("autoTitleFromTurns", () => {
  it("uses the first thing the person said", () => {
    expect(autoTitleFromTurns([turn("user", "Hi mum"), turn("assistant", "Hello love")])).toBe("Hi mum");
  });

  it("skips a leading assistant turn to find the person's words", () => {
    expect(autoTitleFromTurns([turn("assistant", "Hello love"), turn("user", "Hi mum")])).toBe("Hi mum");
  });

  it("falls back when there is nothing to go on", () => {
    expect(autoTitleFromTurns([])).toBe(AUTO_TITLE_FALLBACK);
    expect(autoTitleFromTurns([turn("user", "   ")])).toBe(AUTO_TITLE_FALLBACK);
  });

  it("collapses whitespace and truncates long openers", () => {
    expect(autoTitleFromTurns([turn("user", "Hi    mum\n how are you")])).toBe("Hi mum how are you");
    const long = "a".repeat(100);
    expect(autoTitleFromTurns([turn("user", long)]).length).toBe(64);
  });
});

describe("isAutoTitle", () => {
  const turns = [turn("user", "Hi mum")];

  it("treats the derived opener as still auto", () => {
    // Safe for the summariser to replace with something better.
    expect(isAutoTitle("Hi mum", turns)).toBe(true);
  });

  it("treats the placeholder and empties as auto", () => {
    expect(isAutoTitle(AUTO_TITLE_FALLBACK, turns)).toBe(true);
    expect(isAutoTitle("", turns)).toBe(true);
    expect(isAutoTitle(null, turns)).toBe(true);
  });

  it("protects a title a person chose", () => {
    // Renaming is deliberate; no later summarise may overwrite it.
    expect(isAutoTitle("The last good afternoon", turns)).toBe(false);
  });

  it("protects a previously generated title from being rewritten each pass", () => {
    expect(isAutoTitle("The garden, and Dad's tools", turns)).toBe(false);
  });
});

describe("normaliseTitle", () => {
  it("strips wrapping quotes and trailing punctuation", () => {
    expect(normaliseTitle('"The garden, and Dad\'s tools."')).toBe("The garden, and Dad's tools");
  });

  it("collapses whitespace", () => {
    expect(normaliseTitle("  The   garden  ")).toBe("The garden");
  });

  it("rejects nothing useful", () => {
    expect(normaliseTitle("")).toBeNull();
    expect(normaliseTitle("   ")).toBeNull();
    expect(normaliseTitle(null)).toBeNull();
    expect(normaliseTitle("a")).toBeNull();
  });

  it("truncates an over-long title", () => {
    const out = normaliseTitle("word ".repeat(40));
    expect(out).not.toBeNull();
    expect(out!.length).toBeLessThanOrEqual(60);
  });
});

describe("bucketFor", () => {
  it("buckets by calendar day, not elapsed hours", () => {
    expect(bucketFor(NOW, NOW)).toBe("Today");
    expect(bucketFor(daysAgo(1), NOW)).toBe("Yesterday");
    expect(bucketFor(daysAgo(3), NOW)).toBe("This week");
    expect(bucketFor(daysAgo(10), NOW)).toBe("This month");
    expect(bucketFor(daysAgo(90), NOW)).toBe("Earlier");
  });

  it("treats a future timestamp as today rather than falling through", () => {
    expect(bucketFor(NOW + 60_000, NOW)).toBe("Today");
  });
});

describe("groupConversations", () => {
  it("lifts pinned into their own section regardless of age", () => {
    const groups = groupConversations(
      [
        conversation({ id: "old-pinned", updatedAt: daysAgo(200), pinned: true }),
        conversation({ id: "today", updatedAt: NOW }),
      ],
      NOW,
    );
    expect(groups[0]?.bucket).toBe("Pinned");
    expect(groups[0]?.conversations[0]?.id).toBe("old-pinned");
    expect(groups[1]?.bucket).toBe("Today");
  });

  it("orders sections newest-first and sorts within them", () => {
    const groups = groupConversations(
      [
        conversation({ id: "older", updatedAt: daysAgo(10) }),
        conversation({ id: "newer", updatedAt: NOW }),
        conversation({ id: "mid", updatedAt: daysAgo(3) }),
      ],
      NOW,
    );
    expect(groups.map((g) => g.bucket)).toEqual(["Today", "This week", "This month"]);
  });

  it("omits empty sections", () => {
    const groups = groupConversations([conversation({ id: "a", updatedAt: NOW })], NOW);
    expect(groups).toHaveLength(1);
  });

  it("handles an empty list", () => {
    expect(groupConversations([], NOW)).toEqual([]);
  });
});

describe("searchConversations", () => {
  const rows = [
    conversation({ id: "a", title: "The garden", turns: [turn("user", "Do you remember the roses")] }),
    conversation({ id: "b", title: "School run", turns: [turn("assistant", "You always drove too fast")] }),
  ];

  it("returns everything for an empty query", () => {
    expect(searchConversations(rows, "  ")).toHaveLength(2);
  });

  it("matches on title", () => {
    expect(searchConversations(rows, "garden").map((c) => c.id)).toEqual(["a"]);
  });

  it("matches on what was actually said, in either voice", () => {
    // The useful half — people search for a sentence, not a heading.
    expect(searchConversations(rows, "roses").map((c) => c.id)).toEqual(["a"]);
    expect(searchConversations(rows, "drove too fast").map((c) => c.id)).toEqual(["b"]);
  });

  it("ignores case", () => {
    expect(searchConversations(rows, "GARDEN").map((c) => c.id)).toEqual(["a"]);
  });

  it("returns nothing when nothing matches", () => {
    expect(searchConversations(rows, "zzzz")).toEqual([]);
  });
});

describe("matchingSnippet", () => {
  const row = conversation({
    id: "a",
    turns: [turn("user", "We planted the roses along the south wall that summer")],
  });

  it("shows why a result matched", () => {
    const snippet = matchingSnippet(row, "roses");
    expect(snippet).toContain("roses");
  });

  it("is null without a query or a hit", () => {
    expect(matchingSnippet(row, "")).toBeNull();
    expect(matchingSnippet(row, "zzzz")).toBeNull();
  });

  it("windows around a hit that sits late in a long turn", () => {
    const long = conversation({
      id: "b",
      turns: [turn("user", `${"filler ".repeat(40)}needle at the end`)],
    });
    const snippet = matchingSnippet(long, "needle");
    expect(snippet).toContain("needle");
    expect(snippet!.startsWith("…")).toBe(true);
  });
});

describe("lastSpokenLine", () => {
  it("takes the last line with anything in it", () => {
    const row = conversation({
      id: "a",
      turns: [turn("user", "Hi"), turn("assistant", "Hello love"), turn("user", "   ")],
    });
    expect(lastSpokenLine(row)).toBe("Hello love");
  });

  it("is null when nothing was said", () => {
    expect(lastSpokenLine(conversation({ id: "a", turns: [] }))).toBeNull();
  });

  it("truncates a long line", () => {
    const row = conversation({ id: "a", turns: [turn("assistant", "x".repeat(200))] });
    expect(lastSpokenLine(row, 40)!.length).toBeLessThanOrEqual(40);
  });
});
