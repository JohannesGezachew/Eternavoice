"use server";

import { createClient } from "@/lib/supabase/server";
import { deriveUserKey, encryptField, decryptField } from "@/lib/crypto";
import type { MemoryItem } from "@/lib/types";

/**
 * Hand-written notes and auto-captured facts are fetched separately, and this
 * is not an optimisation.
 *
 * A single `order by created_at desc limit 80` looks fair and isn't: the
 * summariser writes up to twenty memories every eight turns, so auto-captured
 * rows saturate any recency window almost immediately. Every memory the user
 * actually wrote is older by definition, fell outside the window, and simply
 * stopped existing as far as the app was concerned — the memories page showed
 * "Nothing here yet" beside a note saying 80 more were remembered.
 */
const KEPT_LIMIT = 300;
const AUTO_LIMIT = 200;

export async function getMemories(subjectId?: string): Promise<MemoryItem[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const key = deriveUserKey(user.id);
  const base = () => {
    const q = supabase
      .from("memories")
      .select("id, subject_id, content_enc, created_at, updated_at, memory_type")
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    return subjectId ? q.eq("subject_id", subjectId) : q;
  };

  const [keptRes, autoRes] = await Promise.all([
    // Legacy rows predate memory_type and were all hand-written, so "not
    // conversation" is the correct test rather than "equals manual".
    base().neq("memory_type", "conversation").limit(KEPT_LIMIT),
    base().eq("memory_type", "conversation").limit(AUTO_LIMIT),
  ]);
  if (keptRes.error) throw keptRes.error;
  if (autoRes.error) throw autoRes.error;

  const data = [...(keptRes.data ?? []), ...(autoRes.data ?? [])];

  return data
    .map((row): MemoryItem | null => {
      let content: string;
      try {
        content = decryptField(row.content_enc, key);
      } catch {
        // Dropped rather than surfaced as an empty memory: an empty string in
        // the editor invites the user to "save" over it, which would replace
        // recoverable ciphertext with an encryption of "". Logged so a key
        // problem is visible instead of silently eroding memories.
        console.error("[memories] row failed to decrypt", { memoryId: row.id });
        return null;
      }
      return {
        id: row.id,
        content,
        createdAt: new Date(row.created_at).getTime(),
        updatedAt: new Date(row.updated_at).getTime(),
        subjectId: row.subject_id,
        // memory_type is the source discriminator; legacy "general" rows count
        // as manual so existing hand-written notes are never hidden.
        source: (row.memory_type === "conversation" ? "conversation" : "manual") as
          | "conversation"
          | "manual",
      };
    })
    .filter((m): m is MemoryItem => m !== null);
}

export async function addMemoryDb(content: string, subjectId?: string): Promise<MemoryItem> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const key = deriveUserKey(user.id);
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("memories")
    .insert({
      user_id: user.id,
      subject_id: subjectId ?? null,
      content_enc: encryptField(content, key),
      // User-added memories are tagged "manual" so the display can show only
      // these and hide the summariser's auto-extracted ones.
      memory_type: "manual",
      created_at: now,
      updated_at: now,
    })
    .select("id, created_at, updated_at")
    .single();
  if (error) throw error;

  return {
    id: data.id,
    content,
    createdAt: new Date(data.created_at).getTime(),
    updatedAt: new Date(data.updated_at).getTime(),
    subjectId: subjectId ?? null,
    source: "manual",
  };
}

export async function updateMemoryDb(id: string, content: string): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const key = deriveUserKey(user.id);
  const { error } = await supabase
    .from("memories")
    .update({ content_enc: encryptField(content, key), updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) throw error;
}

export async function deleteMemoryDb(id: string): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  const { error } = await supabase
    .from("memories")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) throw error;
}

/**
 * Keep an auto-captured memory as your own.
 *
 * The summariser's memories are hidden by default — the list is meant to read
 * as a record of what you chose to keep — and there was no way to move one
 * across. So finding something the persona had noticed and wanting to hold
 * onto it meant retyping it by hand, which created a near-duplicate of a
 * memory that was already correct, and left the original still hidden behind
 * the toggle.
 *
 * Only the source changes. The content, the date it was first noticed and the
 * person it belongs to are all part of what makes it worth keeping.
 */
export async function keepMemoryDb(id: string): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { error } = await supabase
    .from("memories")
    .update({ memory_type: "manual", updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) throw error;
}
