import { describe, it, expect } from "vitest";
import { isArchived, selectPeople, countArchived, describeCorpusQuality } from "./peopleView";

interface Person {
  id: string;
  archived_at?: string | null;
}

const onShelf: Person = { id: "dad", archived_at: null };
const archived: Person = { id: "gran", archived_at: "2026-08-01T10:00:00.000Z" };
// Written before migration 008 added the column, or served by an older
// /api/user/data that does not select it.
const legacy: Person = { id: "mum" };

const all = [onShelf, archived, legacy];

describe("isArchived", () => {
  it("treats a row with no archive column as on the shelf", () => {
    // The dangerous default. If "absent" ever counted as archived, every person
    // would vanish from the library at once.
    expect(isArchived(legacy)).toBe(false);
    expect(isArchived(undefined)).toBe(false);
    expect(isArchived(null)).toBe(false);
  });

  it("ignores an empty timestamp", () => {
    // Postgres returns null, but a JSON round-trip through an empty text column
    // must not archive someone.
    expect(isArchived({ archived_at: "" })).toBe(false);
    expect(isArchived({ archived_at: "   " })).toBe(false);
  });

  it("counts a real timestamp", () => {
    expect(isArchived(archived)).toBe(true);
  });
});

describe("selectPeople", () => {
  it("hides archived people by default", () => {
    expect(selectPeople(all).map((p) => p.id)).toEqual(["dad", "mum"]);
  });

  it("shows everyone when asked", () => {
    expect(selectPeople(all, { includeArchived: true })).toEqual(all);
  });

  it("never drops someone who was never archived", () => {
    // Unarchiving writes null back; that person must return to the shelf.
    expect(selectPeople([{ ...archived, archived_at: null }]).length).toBe(1);
  });
});

describe("countArchived", () => {
  it("counts exactly what the default view is holding back", () => {
    expect(countArchived(all)).toBe(1);
  });

  it("is zero when there is nothing to reveal", () => {
    expect(countArchived([onShelf, legacy])).toBe(0);
  });
});

describe("describeCorpusQuality", () => {
  it("says nothing when the score was never captured", () => {
    // Nothing writes this column yet, so null is the normal case and must not
    // render as "Rough" — a false verdict on how someone's voice was preserved.
    expect(describeCorpusQuality(null)).toBeNull();
    expect(describeCorpusQuality(undefined)).toBeNull();
  });

  it("refuses a score that cannot be on a 0–100 scale", () => {
    // A fraction, a percentage-of-something-else, a negative sentinel: any of
    // these would otherwise be labelled with confidence they don't deserve.
    expect(describeCorpusQuality(-1)).toBeNull();
    expect(describeCorpusQuality(101)).toBeNull();
    expect(describeCorpusQuality(Number.NaN)).toBeNull();
  });

  it("names each band at its boundary", () => {
    expect(describeCorpusQuality(80)?.label).toBe("Strong");
    expect(describeCorpusQuality(79)?.label).toBe("Good");
    expect(describeCorpusQuality(60)?.label).toBe("Good");
    expect(describeCorpusQuality(59)?.label).toBe("Usable");
    expect(describeCorpusQuality(40)?.label).toBe("Usable");
    expect(describeCorpusQuality(39)?.label).toBe("Rough");
    expect(describeCorpusQuality(0)?.label).toBe("Rough");
  });

  it("shows a whole number", () => {
    expect(describeCorpusQuality(82.4)).toEqual({ label: "Strong", score: 82 });
  });
});
