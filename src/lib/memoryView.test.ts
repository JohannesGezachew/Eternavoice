import { describe, it, expect } from "vitest";
import { selectMemories, countAutoMemories, isRememberable } from "./memoryView";
import type { MemoryItem } from "./types";

function memory(partial: Partial<MemoryItem> & { id: string }): MemoryItem {
  return {
    content: `memory ${partial.id}`,
    createdAt: 0,
    updatedAt: 0,
    subjectId: null,
    source: "manual",
    ...partial,
  };
}

const kept = memory({ id: "kept", subjectId: "dad", source: "manual" });
const auto = memory({ id: "auto", subjectId: "dad", source: "conversation" });
const otherPerson = memory({ id: "mum", subjectId: "mum", source: "manual" });
// Written before memories were per-person: belongs to everyone.
const legacyUnscoped = memory({ id: "legacy", subjectId: null, source: "manual" });
// Rows from before memory_type existed carry no source at all.
const legacyNoSource = memory({ id: "nosource", subjectId: "dad", source: undefined });

const all = [kept, auto, otherPerson, legacyUnscoped, legacyNoSource];

describe("selectMemories", () => {
  it("hides auto-extracted memories by default", () => {
    // The whole point of the default: this list is a record of what the person
    // chose to keep, not everything the summariser noticed.
    const ids = selectMemories(all).map((m) => m.id);
    expect(ids).not.toContain("auto");
    expect(ids).toContain("kept");
  });

  it("reveals auto-extracted memories when asked", () => {
    const ids = selectMemories(all, { includeAuto: true }).map((m) => m.id);
    expect(ids).toContain("auto");
    expect(ids).toContain("kept");
  });

  it("treats a legacy row with no source as one the user kept", () => {
    // Hand-written notes from before memory_type existed must never vanish.
    expect(selectMemories(all).map((m) => m.id)).toContain("nosource");
  });

  it("scopes to one person, and keeps legacy unscoped notes with them", () => {
    const ids = selectMemories(all, { subjectId: "dad" }).map((m) => m.id);
    expect(ids).toEqual(expect.arrayContaining(["kept", "nosource", "legacy"]));
    expect(ids).not.toContain("mum");
  });

  it("never leaks one person's memories into another's", () => {
    const ids = selectMemories(all, { subjectId: "mum" }).map((m) => m.id);
    expect(ids).not.toContain("kept");
    expect(ids).not.toContain("auto");
  });

  it("returns only unscoped notes for the General group", () => {
    expect(selectMemories(all, { subjectId: null }).map((m) => m.id)).toEqual(["legacy"]);
  });

  it("spans every person when no subject is given", () => {
    const ids = selectMemories(all).map((m) => m.id);
    expect(ids).toContain("kept");
    expect(ids).toContain("mum");
  });

  it("combines scoping and the reveal", () => {
    const ids = selectMemories(all, { subjectId: "dad", includeAuto: true }).map((m) => m.id);
    expect(ids).toContain("auto");
    expect(ids).not.toContain("mum");
  });
});

describe("countAutoMemories", () => {
  it("counts what the default view is holding back", () => {
    expect(countAutoMemories(all)).toBe(1);
  });

  it("counts per person when scoped", () => {
    expect(countAutoMemories(all, "dad")).toBe(1);
    expect(countAutoMemories(all, "mum")).toBe(0);
  });

  it("is zero when there is nothing to reveal", () => {
    expect(countAutoMemories([kept, otherPerson])).toBe(0);
  });
});

describe("isRememberable", () => {
  it("declines the acknowledgements that make up half a spoken conversation", () => {
    for (const filler of ["yeah", "mm", "okay", "I know", "", "   "]) {
      expect(isRememberable(filler)).toBe(false);
    }
  });

  it("accepts something with substance in it", () => {
    expect(isRememberable("My daughter got into medical school today")).toBe(true);
  });

  it("ignores surrounding whitespace when measuring", () => {
    expect(isRememberable(`   ${"a".repeat(14)}   `)).toBe(false);
    expect(isRememberable(`   ${"a".repeat(15)}   `)).toBe(true);
  });

  it("handles a missing transcript", () => {
    expect(isRememberable(undefined)).toBe(false);
  });
});
