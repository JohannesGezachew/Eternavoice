import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));
process.env.OPENAI_API_KEY ??= "test-key";

const { shapeExtraction } = await import("./route");

/**
 * These cover the failure modes that would otherwise cost a user their whole
 * 2-3 minute narration. The model is asked for short memories and a handful of
 * them, but it overshoots — that must degrade, never throw.
 */
describe("shapeExtraction", () => {
  it("keeps a well-formed extraction intact", () => {
    const out = shapeExtraction(
      {
        description: "Warm, dry-humoured, never one for fuss.",
        relationship: "My father",
        catchphrases: "go on then\nsame as ever",
        speechStyle: { warmth: 8, directness: 6, expressiveness: 4, humor: 7, talkativeness: 3 },
        memories: ["I taught you to fish on Saturday mornings."],
      },
      false,
    );
    expect(out.persona.description).toBe("Warm, dry-humoured, never one for fuss.");
    expect(out.persona.relationship).toBe("My father");
    expect(out.persona.speechStyle.warmth).toBe(8);
    expect(out.memories).toEqual(["I taught you to fish on Saturday mornings."]);
  });

  it("does NOT throw on an over-long memory — it trims it", () => {
    // Previously a >240 char memory made the whole request 502.
    const long = "a".repeat(400);
    const out = shapeExtraction({ memories: [long] }, false);
    expect(out.memories).toHaveLength(1);
    expect(out.memories[0]!.length).toBeLessThanOrEqual(240);
  });

  it("does NOT throw when the model returns too many memories — it caps them", () => {
    const many = Array.from({ length: 25 }, (_, i) => `Memory ${i}`);
    const out = shapeExtraction({ memories: many }, false);
    expect(out.memories).toHaveLength(10);
  });

  it("does NOT throw on an over-long description — it trims it", () => {
    const out = shapeExtraction({ description: "word ".repeat(400) }, false);
    expect(out.persona.description!.length).toBeLessThanOrEqual(600);
  });

  it("trims on a word boundary rather than mid-word", () => {
    const out = shapeExtraction({ memories: [`${"lorem ipsum ".repeat(40)}end`] }, false);
    expect(out.memories[0]).not.toMatch(/\s$/);
    expect(out.memories[0]!.length).toBeLessThanOrEqual(240);
  });

  it("defaults every speech dial to 5 when absent", () => {
    const style = shapeExtraction({}, false).persona.speechStyle;
    expect(style).toEqual({
      warmth: 5,
      directness: 5,
      expressiveness: 5,
      humor: 5,
      talkativeness: 5,
    });
  });

  it("clamps out-of-range and non-numeric dials into 0-10", () => {
    const style = shapeExtraction(
      { speechStyle: { warmth: 99, directness: -4, humor: 7.6 } },
      false,
    ).persona.speechStyle;
    expect(style.warmth).toBe(10);
    expect(style.directness).toBe(0);
    expect(style.humor).toBe(8);
  });

  it("drops relationship in self mode", () => {
    const out = shapeExtraction({ relationship: "My father" }, true);
    expect(out.persona.relationship).toBeUndefined();
  });

  it("drops blank and whitespace-only memories", () => {
    const out = shapeExtraction({ memories: ["   ", "", "Real one."] }, false);
    expect(out.memories).toEqual(["Real one."]);
  });

  it("survives an empty object (a very thin narration)", () => {
    const out = shapeExtraction({}, false);
    expect(out.memories).toEqual([]);
    expect(out.persona.description).toBeUndefined();
  });

  it("still throws on structurally wrong types, so the route can 502", () => {
    expect(() => shapeExtraction({ memories: "not-an-array" }, false)).toThrow();
  });
});
