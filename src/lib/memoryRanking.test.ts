import { describe, it, expect } from "vitest";
import { rankMemoriesForPrompt, type RankableMemory } from "./memoryRanking";

function kept(content: string, updatedAt = 0): RankableMemory {
  return { content, source: "manual", updatedAt };
}
function auto(content: string, updatedAt = 0): RankableMemory {
  return { content, source: "conversation", updatedAt };
}

describe("rankMemoriesForPrompt", () => {
  it("always carries what the person kept by hand", () => {
    // The bug this exists for: the summariser writes up to twenty memories per
    // pass, so a recency window filled with its output and dropped every note
    // someone had deliberately bookmarked.
    const memories = [
      ...Array.from({ length: 30 }, (_, i) => auto(`auto fact number ${i}`, 1000 + i)),
      kept("Your daughter Ana got into medical school", 1),
    ];
    const { selected } = rankMemoriesForPrompt(memories, "", 10);
    expect(selected.map((m) => m.content)).toContain(
      "Your daughter Ana got into medical school",
    );
  });

  it("puts kept memories first", () => {
    const { selected } = rankMemoriesForPrompt(
      [auto("an auto fact", 999), kept("a kept note", 1)],
      "",
      5,
    );
    expect(selected[0]?.content).toBe("a kept note");
  });

  it("prefers auto memories that bear on what is being said", () => {
    const memories = [
      auto("We planted roses along the south wall", 1),
      auto("The car needed a new gearbox that winter", 2),
      auto("You always burnt the toast on Sundays", 3),
    ];
    const { selected } = rankMemoriesForPrompt(
      memories,
      "I was in the garden today thinking about the roses",
      1,
    );
    expect(selected[0]?.content).toBe("We planted roses along the south wall");
  });

  it("falls back to recency when there is nothing to match on", () => {
    const memories = [auto("older", 1), auto("newer", 99)];
    const { selected } = rankMemoriesForPrompt(memories, "", 1);
    expect(selected[0]?.content).toBe("newer");
  });

  it("ignores stop words so common English doesn't decide relevance", () => {
    const memories = [
      auto("That was the thing you had with them", 1),
      auto("Your brother Tom lives in Leeds", 2),
    ];
    const { selected } = rankMemoriesForPrompt(memories, "how is Tom doing in Leeds", 1);
    expect(selected[0]?.content).toBe("Your brother Tom lives in Leeds");
  });

  it("does not let a long rambling memory outrank a precise one", () => {
    // Length is measured in distinct words, so the filler has to be varied —
    // repeating one word says nothing about how much a memory is about.
    const rambling = `roses ${Array.from({ length: 40 }, (_, i) => `topic${i}`).join(" ")}`;
    const { selected } = rankMemoriesForPrompt(
      [auto(rambling, 1), auto("The roses did well that year", 2)],
      "tell me about the roses",
      1,
    );
    expect(selected[0]?.content).toBe("The roses did well that year");
  });

  it("treats a legacy memory with no source as kept", () => {
    // Rows written before memory_type existed were all hand-written.
    const legacy: RankableMemory = { content: "an old note", updatedAt: 1 };
    const { selected } = rankMemoriesForPrompt([auto("newer", 99), legacy], "", 1);
    expect(selected[0]?.content).toBe("an old note");
  });

  it("truncates kept memories when they alone exceed the limit", () => {
    const memories = Array.from({ length: 30 }, (_, i) => kept(`note ${i}`, i));
    const { selected, omitted } = rankMemoriesForPrompt(memories, "", 10);
    expect(selected).toHaveLength(10);
    expect(omitted).toBe(20);
    // Most recent kept notes win when there are too many to carry.
    expect(selected[0]?.content).toBe("note 29");
  });

  it("reports how many were left behind", () => {
    const memories = [kept("a", 1), auto("b", 2), auto("c", 3)];
    const { selected, omitted } = rankMemoriesForPrompt(memories, "", 2);
    expect(selected).toHaveLength(2);
    expect(omitted).toBe(1);
  });

  it("handles an empty set", () => {
    const { selected, omitted } = rankMemoriesForPrompt([], "anything", 24);
    expect(selected).toEqual([]);
    expect(omitted).toBe(0);
  });
});
