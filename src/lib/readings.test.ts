import { describe, it, expect } from "vitest";
import {
  splitForReading,
  readingLength,
  estimateSpokenSeconds,
  formatSpokenLength,
} from "./readings";

describe("splitForReading", () => {
  it("keeps the words exactly as written", () => {
    // The whole point of a reading: no shortening, no de-exclaiming, no
    // fillers. Whatever the conversation pipeline does to a reply, none of it
    // may happen to someone's own letter.
    const script = "I never got to say it! You were right, always.";
    const spoken = splitForReading(script).map((s) => s.text).join(" ");
    expect(spoken).toBe(script);
  });

  it("splits on sentence endings and keeps the punctuation", () => {
    const segments = splitForReading("One thing. And another? Then this!");
    expect(segments.map((s) => s.text)).toEqual([
      "One thing.",
      "And another?",
      "Then this!",
    ]);
  });

  it("pauses longer between paragraphs than between sentences", () => {
    const segments = splitForReading("First line.\n\nSecond line.");
    expect(segments).toHaveLength(2);
    expect(segments[0]!.pauseMs).toBeGreaterThan(400);
  });

  it("leaves no pause after the final line", () => {
    const segments = splitForReading("Only this.");
    expect(segments.at(-1)!.pauseMs).toBe(0);
  });

  it("collapses single newlines inside a paragraph", () => {
    // Hard-wrapped text pasted from an email should read as prose.
    const segments = splitForReading("A line\nwrapped oddly.");
    expect(segments.map((s) => s.text)).toEqual(["A line wrapped oddly."]);
  });

  it("ignores blank space around and between paragraphs", () => {
    const segments = splitForReading("\n\n  First.  \n\n\n\n  Second.  \n\n");
    expect(segments.map((s) => s.text)).toEqual(["First.", "Second."]);
  });

  it("breaks a run-on sentence at a clause so the voice can breathe", () => {
    const runOn = `${"and on ".repeat(80)}end`;
    const segments = splitForReading(runOn);
    expect(segments.length).toBeGreaterThan(1);
    // Still verbatim once rejoined.
    expect(segments.map((s) => s.text).join(" ")).toBe(runOn.replace(/\s+/g, " ").trim());
  });

  it("never emits an empty segment", () => {
    const segments = splitForReading("Hello.   \n\n   \n\n  World.");
    expect(segments.every((s) => s.text.trim().length > 0)).toBe(true);
  });

  it("handles an empty script", () => {
    expect(splitForReading("")).toEqual([]);
    expect(splitForReading("   \n\n  ")).toEqual([]);
  });

  it("handles a script with no terminal punctuation at all", () => {
    const segments = splitForReading("just a fragment with no full stop");
    expect(segments.map((s) => s.text)).toEqual(["just a fragment with no full stop"]);
  });
});

describe("length helpers", () => {
  it("measures the trimmed script", () => {
    expect(readingLength("  abc  ")).toBe(3);
  });

  it("estimates spoken time from word count", () => {
    // 150 words at 150wpm is a minute.
    const words = Array.from({ length: 150 }, () => "word").join(" ");
    expect(estimateSpokenSeconds(words)).toBe(60);
  });

  it("phrases short scripts in seconds and longer ones in minutes", () => {
    expect(formatSpokenLength("a few words here")).toMatch(/seconds/);
    expect(formatSpokenLength(Array.from({ length: 300 }, () => "w").join(" "))).toMatch(
      /minutes/,
    );
  });

  it("never claims zero seconds", () => {
    expect(formatSpokenLength("hi")).toMatch(/1 seconds|about 1/);
  });
});
