"use server";

import { createClient } from "@/lib/supabase/server";
import { deriveUserKey, encryptField, decryptField } from "@/lib/crypto";
import type { ConversationRecord, ChatTurn } from "@/lib/types";

// NOTE: do not export a key-deriving helper from this file. Every exported
// async function in a "use server" module is a candidate Server Action with a
// public HTTP endpoint — an exported `getUserDataKey(userId)` would be a
// caller-controlled, unauthenticated key-disclosure endpoint one client import
// away. Derive inline from the *authenticated* user instead.

/**
 * Why an outcome and not a throw.
 *
 * In production Next.js replaces a Server Action's thrown error with an opaque
 * digest, so the client could not tell "your session ended" from "the database
 * is unhappy" — and told the user "something went wrong" when the honest
 * answer was "sign in again". A return value crosses the boundary intact. It
 * also has to be looked at, which the previous `.catch(console.error)` call
 * site is proof of the need for.
 */
export type SaveOutcome =
  | { ok: true }
  | { ok: false; reason: "unauthorized" | "failed"; message?: string };

export async function saveConversation(
  conversation: ConversationRecord,
): Promise<SaveOutcome> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, reason: "unauthorized" };

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
  if (convErr) return { ok: false, reason: "failed", message: convErr.message };

  // Upsert all turns — except any whose plaintext we never recovered. Writing
  // those back would replace good ciphertext with an encryption of "".
  const writableTurns = conversation.turns.filter((turn) => !turn.undecryptable);
  if (writableTurns.length === 0) return { ok: true };
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
  if (turnsErr) return { ok: false, reason: "failed", message: turnsErr.message };

  return { ok: true };
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
    // In step with MAX_CONVERSATIONS in lib/session.ts.
    .limit(200);
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

/**
 * Delete a conversation, and mean it.
 *
 * This set `deleted_at` and stopped. The transcript stayed in `turns`, and —
 * the part that showed — the rolling summary of that conversation stayed in
 * `session_summaries`, where the chat route reads the four most recent for the
 * person and feeds them to the persona as previous sessions. So someone would
 * delete a conversation they could not bear to have again, be told it was
 * permanently removed, and then be asked about it in their mother's voice.
 *
 * Summaries go first and explicitly: the foreign key is `on delete set null`,
 * so relying on the cascade would leave the summary in place with nothing
 * connecting it to the conversation it came from — unreachable, unattributable
 * and still being read aloud. The conversation is then removed outright and
 * `turns` cascades with it, which is what the confirmation dialog promises.
 *
 * Memories are deliberately untouched. Something the user chose to keep is not
 * part of the transcript it was noticed in, and it has its own list and its own
 * delete.
 */
export async function deleteConversationDb(id: string): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { error: summaryError } = await supabase
    .from("session_summaries")
    .delete()
    .eq("conversation_id", id)
    .eq("user_id", user.id);
  if (summaryError) throw summaryError;

  const { error } = await supabase
    .from("conversations")
    .delete()
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
