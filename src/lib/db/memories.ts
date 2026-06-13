"use server";

import { createClient } from "@/lib/supabase/server";
import { deriveUserKey, encryptField, decryptField } from "@/lib/crypto";
import type { MemoryItem } from "@/lib/types";

export async function getMemories(subjectId?: string): Promise<MemoryItem[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const key = deriveUserKey(user.id);
  let query = supabase
    .from("memories")
    .select("id, subject_id, content_enc, created_at, updated_at")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (subjectId) {
    query = query.eq("subject_id", subjectId);
  }

  const { data, error } = await query.limit(80);
  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id as string,
    content: (() => {
      try { return decryptField(row.content_enc as string, key); } catch { return ""; }
    })(),
    createdAt: new Date(row.created_at as string).getTime(),
    updatedAt: new Date(row.updated_at as string).getTime(),
    subjectId: (row.subject_id as string | null) ?? null,
  }));
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
      memory_type: "general",
      created_at: now,
      updated_at: now,
    })
    .select("id, created_at, updated_at")
    .single();
  if (error) throw error;

  return {
    id: data.id as string,
    content,
    createdAt: new Date(data.created_at as string).getTime(),
    updatedAt: new Date(data.updated_at as string).getTime(),
    subjectId: subjectId ?? null,
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
    .eq("id", id);
  if (error) throw error;
}

export async function deleteMemoryDb(id: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("memories")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}
