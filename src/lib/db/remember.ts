"use server";

import { createClient } from "@/lib/supabase/server";
import { deriveUserKey, encryptField, decryptField } from "@/lib/crypto";
import { checkRate } from "@/lib/rateLimit";
import { openai } from "@/lib/openai";
import type { MemoryItem } from "@/lib/types";

// NOTE: this module is "use server", so every export is a public HTTP
// endpoint. Keep helpers unexported, and keep the only export gated on the
// *authenticated* user — never on an id passed in by the caller.

export type RememberResult =
  | {
      ok: true;
      memory: MemoryItem;
      /** The persona already carried this — either the user saved it before,
       *  or the summariser picked it up. Nothing new was inserted. */
      alreadyKnown: boolean;
    }
  | { ok: false; reason: "unauthorized" | "rate_limited" | "empty" | "failed" };

/** Loose match, so "Her name is Ana." and "her name is ana" are one memory. */
function normalise(value: string): string {
  return value
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[.!?…]+$/, "")
    .trim();
}

/**
 * Rewrite what the person said into a note the persona can read back as its
 * own memory.
 *
 * This is not a nicety. Every memory in the system is written from the
 * persona's point of view — the summariser and the narration extractor both
 * enforce it — and buildChatPrompt feeds them in under "What you remember
 * about them". Storing the raw utterance means the persona later reads "I want
 * you to remember my daughter got in" as *its own words*, and concludes that it
 * was the one asking to be reminded.
 *
 * Returns null if the model is unavailable or gives nothing usable; the caller
 * then keeps the raw text rather than losing something the user asked to keep.
 */
async function toPersonaVoice(spoken: string): Promise<string | null> {
  try {
    const response = await openai().chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 120,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: [
            "The person speaking with a voice-companion app has asked that something be remembered. Rewrite it as a durable note the recreated voice (the Persona) will read back to itself later.",
            'Write from the Persona\'s point of view: the Persona is "I", the person speaking is "you". Never use the words "the user" or "the persona".',
            'Return JSON: {"memory": "..."} — one sentence, under 200 characters, declarative and specific.',
            "Keep every concrete detail: names, dates, places, relationships. Change only the point of view and the phrasing.",
            'Strip the request itself — "remember that my daughter got in" becomes "Your daughter got in", not "You asked me to remember that your daughter got in".',
            "Never invent anything that was not said. If there is no durable fact in it, return an empty string.",
          ].join("\n"),
        },
        { role: "user", content: spoken },
      ],
    });
    const raw = JSON.parse(response.choices[0]?.message?.content ?? "{}") as {
      memory?: unknown;
    };
    const memory = typeof raw.memory === "string" ? raw.memory.trim() : "";
    return memory ? memory.slice(0, 500) : null;
  } catch {
    return null;
  }
}

/**
 * Keep something the person said, as a memory the persona carries forward.
 *
 * The single save path behind every "remember this" affordance — the bookmark
 * beside the composer and the pill in the transcript both land here, so a
 * memory is shaped identically however it was kept.
 *
 * Stored as "manual": choosing to keep something *is* the person saving it
 * themselves, so it belongs in the visible list. Only the summariser's passive
 * extraction is "conversation".
 */
export async function rememberSpoken(
  spoken: string,
  subjectId?: string | null,
): Promise<RememberResult> {
  const trimmed = spoken.replace(/\s+/g, " ").trim();
  if (!trimmed) return { ok: false, reason: "empty" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, reason: "unauthorized" };

  // This spends OpenAI money on a public server action, so it needs a ceiling
  // like every other paid path. Wide enough that keeping things freely during
  // a conversation never reaches it.
  const limit = await checkRate(
    { scope: "remember", windowMs: 60 * 60 * 1000, max: 120 },
    user.id,
  );
  if (!limit.ok) return { ok: false, reason: "rate_limited" };

  const key = deriveUserKey(user.id);
  const scoped = subjectId ?? null;

  // Rewriting and reading the existing memories are independent — start both
  // before awaiting either, so keeping something stays a single beat.
  const rewriting = toPersonaVoice(trimmed);
  const baseQuery = supabase
    .from("memories")
    .select("id, content_enc, memory_type")
    .eq("user_id", user.id)
    .is("deleted_at", null);
  const reading = scoped
    ? baseQuery.eq("subject_id", scoped)
    : baseQuery.is("subject_id", null);

  const rewritten = await rewriting;
  const existing = await reading;

  // A failed rewrite must never cost them the memory — keep the raw words.
  const content = rewritten ?? trimmed;
  const target = normalise(content);

  try {
    const rows = (existing.data ?? []) as Array<{
      id: string;
      content_enc: string;
      memory_type: string;
    }>;

    let duplicate: { id: string; memoryType: string; content: string } | null = null;
    for (const row of rows) {
      let plain: string;
      try {
        plain = decryptField(row.content_enc, key);
      } catch {
        continue; // undecryptable row — can't compare it, so it can't match
      }
      if (normalise(plain) === target) {
        duplicate = { id: row.id, memoryType: row.memory_type, content: plain };
        break;
      }
    }

    if (duplicate) {
      const now = new Date().toISOString();
      // The summariser had already quietly captured this. Since they have now
      // asked for it by hand, promote it so it appears in their own list
      // instead of silently doing nothing.
      if (duplicate.memoryType === "conversation") {
        await supabase
          .from("memories")
          .update({ memory_type: "manual", updated_at: now })
          .eq("id", duplicate.id)
          .eq("user_id", user.id);
      }
      return {
        ok: true,
        alreadyKnown: true,
        memory: {
          id: duplicate.id,
          // The stored wording wins — the store must not show a phrasing the
          // database doesn't hold.
          content: duplicate.content,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          subjectId: scoped,
          source: "manual",
        },
      };
    }

    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from("memories")
      .insert({
        user_id: user.id,
        subject_id: scoped,
        content_enc: encryptField(content, key),
        memory_type: "manual",
        created_at: now,
        updated_at: now,
      })
      .select("id, created_at, updated_at")
      .single();
    if (error || !data) return { ok: false, reason: "failed" };

    return {
      ok: true,
      alreadyKnown: false,
      memory: {
        id: data.id as string,
        content,
        createdAt: new Date(data.created_at as string).getTime(),
        updatedAt: new Date(data.updated_at as string).getTime(),
        subjectId: scoped,
        source: "manual",
      },
    };
  } catch {
    return { ok: false, reason: "failed" };
  }
}
