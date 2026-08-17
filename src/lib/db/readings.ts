"use server";

import { createClient } from "@/lib/supabase/server";
import { deriveUserKey, encryptField, decryptField } from "@/lib/crypto";

// NOTE: "use server" — every export is a public endpoint. Each one gates on the
// authenticated user, never on an id handed in by the caller.

export interface ReadingRecord {
  id: string;
  title: string;
  content: string;
  subjectId: string | null;
  updatedAt: number;
}

/** First line of the script, so a saved reading is recognisable without
 *  opening it. A title someone typed is kept as-is. */
function deriveTitle(content: string): string {
  const firstLine = content.replace(/\s+/g, " ").trim();
  if (!firstLine) return "Untitled reading";
  return firstLine.length > 60 ? `${firstLine.slice(0, 57).trimEnd()}…` : firstLine;
}

export async function saveReading(params: {
  id?: string;
  content: string;
  subjectId?: string | null;
  title?: string;
}): Promise<ReadingRecord | null> {
  const content = params.content.trim();
  if (!content) return null;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const key = deriveUserKey(user.id);
  const title = params.title?.trim() || deriveTitle(content);
  const now = new Date().toISOString();

  const row = {
    user_id: user.id,
    subject_id: params.subjectId ?? null,
    title,
    content_enc: encryptField(content, key),
    updated_at: now,
  };

  const { data, error } = params.id
    ? await supabase
        .from("readings")
        .update(row)
        .eq("id", params.id)
        .eq("user_id", user.id)
        .select("id, title, subject_id, updated_at")
        .single()
    : await supabase
        .from("readings")
        .insert({ ...row, created_at: now })
        .select("id, title, subject_id, updated_at")
        .single();

  if (error || !data) throw error ?? new Error("Could not save the reading.");

  return {
    id: data.id as string,
    title: data.title as string,
    content,
    subjectId: (data.subject_id as string | null) ?? null,
    updatedAt: new Date(data.updated_at as string).getTime(),
  };
}

export async function getReadings(subjectId?: string): Promise<ReadingRecord[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const key = deriveUserKey(user.id);
  let query = supabase
    .from("readings")
    .select("id, title, content_enc, subject_id, updated_at")
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .limit(100);
  if (subjectId) query = query.eq("subject_id", subjectId);

  const { data, error } = await query;
  if (error) throw error;

  return (data ?? [])
    .map((row): ReadingRecord | null => {
      try {
        return {
          id: row.id as string,
          title: row.title as string,
          content: decryptField(row.content_enc as string, key),
          subjectId: (row.subject_id as string | null) ?? null,
          updatedAt: new Date(row.updated_at as string).getTime(),
        };
      } catch {
        // Same rule as memories: dropped rather than shown empty, so nobody
        // saves over ciphertext that might still be recoverable.
        console.error("[readings] row failed to decrypt", { readingId: row.id });
        return null;
      }
    })
    .filter((r): r is ReadingRecord => r !== null);
}

export async function deleteReading(id: string): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  const { error } = await supabase
    .from("readings")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) throw error;
}
