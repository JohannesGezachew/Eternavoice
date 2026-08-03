import { describe, it, expect, vi } from "vitest";
import type { PersonaConfig } from "./types";

// prompts.ts is server-only; the guard module is a no-op shim under test.
vi.mock("server-only", () => ({}));

const { buildChatPrompt, buildSystemPrompt } = await import("./prompts");

const persona: PersonaConfig = {
  mode: "persona",
  name: "Margaret",
  relationship: "My mother",
};

const memories = [{ content: "I taught you to fish on Saturday mornings." }];

describe("buildSystemPrompt", () => {
  it("names the person being recreated", () => {
    expect(buildSystemPrompt(persona)).toContain("Margaret");
  });

  it("always carries the hard rules", () => {
    const prompt = buildSystemPrompt(persona);
    expect(prompt).toContain("Always reply in English");
    expect(prompt).toContain("Never use emojis");
  });

  it("never leaks the phrase 'the user' into persona-facing copy", () => {
    // Memories and headers are written in the persona's voice; "the user"
    // reads coldly when the persona recalls them.
    expect(buildChatPrompt(persona, memories)).not.toContain("Known memory, reviewed by the user");
  });
});

describe("buildChatPrompt", () => {
  it("includes memories under a warm header", () => {
    const prompt = buildChatPrompt(persona, memories);
    expect(prompt).toContain("What you remember about them:");
    expect(prompt).toContain("I taught you to fish on Saturday mornings.");
  });

  it("omits the memory block entirely when there are none", () => {
    expect(buildChatPrompt(persona, [])).not.toContain("What you remember about them:");
  });

  it("drops blank memories rather than emitting empty bullets", () => {
    const prompt = buildChatPrompt(persona, [{ content: "   " }, { content: "Real one." }]);
    expect(prompt).toContain("Real one.");
    expect(prompt).not.toMatch(/-\s*\n/);
  });

  it("caps the memory block so the prompt cannot grow unbounded", () => {
    const many = Array.from({ length: 60 }, (_, i) => ({ content: `Memory ${i}` }));
    const prompt = buildChatPrompt(persona, many);
    expect(prompt).toContain("Memory 0");
    expect(prompt).not.toContain("Memory 59");
  });

  it("interviews on a first meeting with no memories", () => {
    const prompt = buildChatPrompt(persona, [], [], true);
    expect(prompt).toContain("remember together");
  });

  it("does NOT interview when the persona was pre-seeded by the narration", () => {
    // The whole point of audio-first onboarding: the first conversation should
    // draw on what it already knows instead of interrogating the user.
    const prompt = buildChatPrompt(persona, memories, [], true);
    expect(prompt).toContain("you already remember");
    expect(prompt).not.toContain("remember together");
  });

  it("adds the interruption directive only when barged in on", () => {
    expect(buildChatPrompt(persona, [], [], false, true)).toContain("cut you off");
    expect(buildChatPrompt(persona, [], [], false, false)).not.toContain("cut you off");
  });

  it("includes prior session summaries for continuity", () => {
    const prompt = buildChatPrompt(persona, [], [
      { summary: "You told me about a hard week.", createdAt: new Date().toISOString() },
    ]);
    expect(prompt).toContain("You told me about a hard week.");
  });
});
