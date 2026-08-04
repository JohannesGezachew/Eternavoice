"use server";

import { createClient } from "@/lib/supabase/server";
import { deriveUserKey, encryptField, decryptField } from "@/lib/crypto";
import type { ConversationRecord, ChatTurn } from "@/lib/types";

// NOTE: do not export a key-deriving helper from this file. Every exported
// async function in a "use server" module is a candidate Server Action with a
// public HTTP endpoint — an exported `getUserDataKey(userId)` would be a
// caller-controlled, unauthenticated key-disclosure endpoint one client import
// away. Derive inline from the *authenticated* user instead.

export async function saveConversation(conversation: ConversationRecord): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const key = deriveUserKey(user.id);

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

  // Upsert all turns — except any whose plaintext we never recovered. Writing
  // those back would replace good ciphertext with an encryption of "".
  const writableTurns = conversation.turns.filter((turn) => !turn.undecryptable);
  if (writableTurns.length === 0) return;
  const turnRows = writableTurns.map((turn) => ({
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

  const key = deriveUserKey(user.id);

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
        // A decrypt failure must NOT become an empty string: saveConversation
        // re-encrypts every turn it is given, so an empty string would be
        // written back over the original ciphertext and the real content lost
        // for good. Mark it instead, and let the save path skip it.
        ...(() => {
          try {
            return { content: decryptField(t.content_enc, key) };
          } catch {
            console.error("[conversations] turn failed to decrypt", { turnId: t.id });
            return { content: "", undecryptable: true as const };
          }
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
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  const { error } = await supabase
    .from("conversations")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) throw error;
}

export async function renameConversationDb(id: string, title: string): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  const { error } = await supabase
    .from("conversations")
    .update({ title: title.slice(0, 200), updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) throw error;
}

export async function pinConversationDb(id: string, pinned: boolean): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  const { error } = await supabase
    .from("conversations")
    .update({ pinned, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) throw error;
}
