"use server";

import { createClient } from "@/lib/supabase/server";
import type { PersonaConfig } from "@/lib/types";
import type { Database, Json } from "@/lib/supabase/types";

export interface SubjectRow {
  id: string;
  name: string;
  relationship: string | null;
  voice_id: string | null;
  voice_name: string | null;
  persona: PersonaConfig;
  corpus_quality_score: number | null;
  /** Set means "hidden from the people page"; the person is otherwise intact. */
  archived_at: string | null;
  created_at: string;
}

export async function getSubjects(): Promise<SubjectRow[]> {
  const supabase = await createClient();
  // Archived subjects are returned like any other: the library hides them, but
  // their page, conversations and memories all still have to load.
  const { data, error } = await supabase
    .from("subjects")
    .select("id, name, relationship, voice_id, voice_name, persona, corpus_quality_score, archived_at, created_at")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (error) throw error;
  // persona is jsonb, so the database type can only promise Json; the app's
  // SubjectRow narrows it to PersonaConfig. Through unknown because those two
  // genuinely do not overlap — which is the honest description of reading a
  // shape out of a schemaless column.
  return (data ?? []) as unknown as SubjectRow[];
}

// There is deliberately no createSubject here. One existed, took a voiceId
// straight from its caller, and had no callers at all — which made it a dead
// public endpoint (every export in a "use server" module is one) that let any
// signed-in user mint a subject pointing at somebody else's cloned voice, and
// so pass assertVoiceOwner for it. Subjects are created by the clone route,
// from a voice that request just made, under the service role.

/**
 * Update a subject the caller owns.
 *
 * voice_id is deliberately NOT updatable here. This file is "use server", so
 * every export is a candidate public endpoint, and assertVoiceOwner decides
 * access by asking "does a subject I own carry this voice_id?". If a caller
 * could set that field, they could point their own subject at someone else's
 * ElevenLabs voice and then synthesize speech in a stranger's late relative's
 * voice through /api/chat or /api/tts. The clone route is the only writer.
 */
export async function updateSubject(
  id: string,
  updates: Partial<{ name: string; relationship: string; persona: PersonaConfig }>,
): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  // Typed as the table's own Update shape rather than Record<string, unknown>,
  // so a column that does not exist — or one this function is deliberately not
  // allowed to touch, such as voice_id — is a compile error rather than a
  // silently ignored key.
  const mapped: Database["public"]["Tables"]["subjects"]["Update"] = {
    updated_at: new Date().toISOString(),
  };
  if (updates.name !== undefined) mapped.name = updates.name.slice(0, 80);
  if (updates.relationship !== undefined) mapped.relationship = updates.relationship.slice(0, 120);
  if (updates.persona !== undefined) mapped.persona = updates.persona as unknown as Json;

  const { error } = await supabase
    .from("subjects")
    .update(mapped)
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) throw error;
}

export async function deleteSubject(id: string): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { error } = await supabase
    .from("subjects")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) throw error;
}

