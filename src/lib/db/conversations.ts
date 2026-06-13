"use server";

import { createClient } from "@/lib/supabase/server";
import { deriveUserKey, encryptField, decryptField } from "@/lib/crypto";
import type { ConversationRecord, ChatTurn } from "@/lib/types";

export async function getUserDataKey(userId: string): Promise<Buffer> {
  // Derive key from master key + userId (stable, no DB lookup needed)
  return deriveUserKey(userId);
}

export async function saveConversation(conversation: ConversationRecord): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const key = await getUserDataKey(user.id);

  // Upsert conversation row
  const { error: convErr } = await supabase
    .from("conversations")
    .upsert({
      id: conversation.id,
      user_id: user.id,
      subject_id: conversation.subjectId ?? null,
      title: conversation.title,
      pinned: conversation.pinned ?? false,
      updated_at: new Date(conversation.updatedAt).toISOString(),
      created_at: new Date(conversation.createdAt).toISOString(),
    });
  if (convErr) throw convErr;

  // Upsert all turns
  if (conversation.turns.length === 0) return;
  const turnRows = conversation.turns.map((turn) => ({
    id: turn.id,
    conversation_id: conversation.id,
    user_id: user.id,
    role: turn.role,
    content_enc: encryptField(turn.content, key),
    feedback: turn.feedback ?? null,
    created_at: new Date(turn.createdAt).toISOString(),
  }));

  const { error: turnsErr } = await supabase.from("turns").upsert(turnRows);
  if (turnsErr) throw turnsErr;
}

export async function getConversations(): Promise<ConversationRecord[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const key = await getUserDataKey(user.id);

  const { data: convRows, error } = await supabase
    .from("conversations")
    .select("*, turns(*)")
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .limit(40);
  if (error) throw error;

  return (convRows ?? []).map((row) => {
    const turns: ChatTurn[] = ((row.turns as Array<{
      id: string; role: string; content_enc: string; feedback: string | null; created_at: string;
    }>) ?? [])
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      .map((t) => ({
        id: t.id,
        role: t.role as "user" | "assistant",
        content: (() => {
          try { return decryptField(t.content_enc, key); } catch { return ""; }
        })(),
        feedback: (t.feedback as ChatTurn["feedback"]) ?? undefined,
        createdAt: new Date(t.created_at).getTime(),
      }));

    return {
      id: row.id as string,
      voiceId: "",
      voiceName: "",
      subjectId: (row.subject_id as string | null) ?? null,
      title: row.title as string,
      persona: { mode: "self" as const, name: "" },
      turns,
      createdAt: new Date(row.created_at as string).getTime(),
      updatedAt: new Date(row.updated_at as string).getTime(),
      pinned: row.pinned as boolean,
    } as ConversationRecord;
  });
}

export async function deleteConversationDb(id: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("conversations")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function renameConversationDb(id: string, title: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("conversations")
    .update({ title, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function pinConversationDb(id: string, pinned: boolean): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("conversations")
    .update({ pinned, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}
