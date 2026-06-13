"use server";

import { createClient } from "@/lib/supabase/server";
import type { PersonaConfig } from "@/lib/types";

export interface SubjectRow {
  id: string;
  name: string;
  relationship: string | null;
  voice_id: string | null;
  voice_name: string | null;
  persona: PersonaConfig;
  corpus_quality_score: number | null;
  created_at: string;
}

export async function getSubjects(): Promise<SubjectRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("subjects")
    .select("id, name, relationship, voice_id, voice_name, persona, corpus_quality_score, created_at")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as SubjectRow[];
}

export async function createSubject(params: {
  name: string;
  relationship?: string;
  voiceId?: string;
  voiceName?: string;
  persona?: PersonaConfig;
}): Promise<SubjectRow> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data, error } = await supabase
    .from("subjects")
    .insert({
      user_id: user.id,
      name: params.name,
      relationship: params.relationship ?? null,
      voice_id: params.voiceId ?? null,
      voice_name: params.voiceName ?? null,
      persona: params.persona ?? { mode: "persona", name: params.name },
    })
    .select()
    .single();
  if (error) throw error;
  return data as SubjectRow;
}

export async function updateSubject(
  id: string,
  updates: Partial<{ name: string; relationship: string; voiceId: string; voiceName: string; persona: PersonaConfig }>,
): Promise<void> {
  const supabase = await createClient();
  const mapped: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (updates.name !== undefined) mapped.name = updates.name;
  if (updates.relationship !== undefined) mapped.relationship = updates.relationship;
  if (updates.voiceId !== undefined) mapped.voice_id = updates.voiceId;
  if (updates.voiceName !== undefined) mapped.voice_name = updates.voiceName;
  if (updates.persona !== undefined) mapped.persona = updates.persona;

  const { error } = await supabase
    .from("subjects")
    .update(mapped)
    .eq("id", id);
  if (error) throw error;
}

export async function deleteSubject(id: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("subjects")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

