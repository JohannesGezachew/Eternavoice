import { describe, it, expect } from "vitest";
import { searchMemories, findDuplicateGroups } from "./memoryView";
import type { MemoryItem } from "./types";

let seq = 0;
const memory = (content: string): MemoryItem => ({
  id: `m${seq++}`,
  content,
  createdAt: 0,
  updatedAt: 0,
  subjectId: null,
  source: "manual",
});

describe("searchMemories", () => {
  it("matches every term, in any order", () => {
    const items = [
      memory("His birthday was the 3rd of June"),
      memory("He drank his tea far too strong"),
    ];
    expect(searchMemories(items, "birthday june")).toHaveLength(1);
    expect(searchMemories(items, "june birthday")).toHaveLength(1);
  });

  it("ignores case and punctuation", () => {
    // Nobody types a search the way they typed the note.
    const items = [memory("Mum's recipe — the one with cardamom")];
    expect(searchMemories(items, "mums cardamom")).toHaveLength(1);
    expect(searchMemories(items, "MUMS RECIPE")).toHaveLength(1);
  });

  it("returns everything for an empty or whitespace query", () => {
    const items = [memory("one"), memory("two")];
    expect(searchMemories(items, "")).toHaveLength(2);
    expect(searchMemories(items, "   ")).toHaveLength(2);
  });

  it("finds nothing when one term is missing", () => {
    const items = [memory("His birthday was the 3rd of June")];
    expect(searchMemories(items, "birthday december")).toHaveLength(0);
  });
});

describe("findDuplicateGroups", () => {
  it("groups the same fact written two ways", () => {
    // Exactly what the summariser produces: it writes from a fresh transcript
    // each time, so an exact-match de-dupe catches none of these.
    const items = [
      memory("Your birthday is the 3rd of June"),
      memory("Your birthday is on the 3rd of June"),
      memory("He hated the cold"),
    ];
    const groups = findDuplicateGroups(items);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toHaveLength(2);
  });

  it("treats a short memory contained in a longer one as a duplicate", () => {
    const items = [
      memory("He hated the cold"),
      memory("He hated the cold and never once wore a coat"),
    ];
    expect(findDuplicateGroups(items)).toHaveLength(1);
  });

  it("does not group memories that merely share common words", () => {
    const items = [
      memory("Your mother was the one who taught him to drive"),
      memory("Your brother was the one who broke the window"),
    ];
    expect(findDuplicateGroups(items)).toHaveLength(0);
  });

  it("does not group on character similarity", () => {
    // "mother" and "brother" are one letter apart and could not be less alike;
    // an edit-distance approach would merge these two people.
    const items = [memory("your mother"), memory("your brother")];
    expect(findDuplicateGroups(items)).toHaveLength(0);
  });

  it("returns nothing when everything is distinct", () => {
    const items = [memory("one thing entirely"), memory("something wholly other")];
    expect(findDuplicateGroups(items)).toHaveLength(0);
  });

  it("puts each memory in at most one group", () => {
    const items = [
      memory("He hated the cold"),
      memory("He hated the cold"),
      memory("He hated the cold weather"),
    ];
    const groups = findDuplicateGroups(items);
    const ids = groups.flat().map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
