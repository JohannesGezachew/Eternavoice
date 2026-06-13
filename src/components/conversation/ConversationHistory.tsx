"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Input } from "@/components/ui/Field";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { useSession } from "@/lib/session";
import { fadeUp, stagger } from "@/lib/motion";
import { formatRelativeDay } from "@/lib/utils";
import {
  renameConversationDb,
  pinConversationDb,
  deleteConversationDb,
} from "@/lib/db/conversations";

/**
 * Per-person conversation history, embedded in the person hub. Opening a
 * conversation activates this person's voice and enters the talk screen.
 */
export function ConversationHistory({
  subjectId,
  voiceId,
  talkHref,
}: {
  subjectId: string | null;
  voiceId: string | null;
  talkHref: string;
}) {
  const router = useRouter();
  const conversations = useSession((s) => s.conversations);
  const openConversation = useSession((s) => s.openConversation);
  const renameConversation = useSession((s) => s.renameConversation);
  const toggleConversationPin = useSession((s) => s.toggleConversationPin);
  const deleteConversation = useSession((s) => s.deleteConversation);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [pendingDelete, setPendingDelete] = useState<{ id: string; title: string } | null>(null);

  const scoped = conversations
    .filter(
      (c) =>
        (subjectId && c.subjectId === subjectId) ||
        (voiceId && c.voiceId === voiceId),
    )
    .sort((a, b) => {
      if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
      return b.updatedAt - a.updatedAt;
    });

  const saveRename = () => {
    if (!editingId) return;
    const clean = draftTitle.replace(/\s+/g, " ").trim();
    if (clean) {
      renameConversation(editingId, clean);
      void renameConversationDb(editingId, clean).catch(console.error);
    }
    setEditingId(null);
    setDraftTitle("");
  };

  if (!scoped.length) {
    return (
      <EmptyState
        compact
        variant="conversations"
        title="No conversations yet"
        body="They'll appear here after your first exchange — every word saved, ready to pick back up."
      />
    );
  }

  return (
    <>
      <motion.div initial={false} animate="enter" variants={stagger(0.05)} className="grid gap-2.5">
        {scoped.map((conversation) => {
          const editing = editingId === conversation.id;
          return (
            <motion.div
              key={conversation.id}
              variants={fadeUp}
              className="group flex flex-col gap-3 rounded-xl border border-[var(--color-rule)] bg-white/[0.015] p-4 transition-colors duration-300 hover:bg-white/[0.025] sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0 flex-1">
                {editing ? (
                  <div className="flex max-w-md gap-2">
                    <Input
                      value={draftTitle}
                      onChange={(e) => setDraftTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveRename();
                        if (e.key === "Escape") setEditingId(null);
                      }}
                      autoFocus
                      maxLength={90}
                      aria-label="Rename conversation"
                    />
                    <button
                      type="button"
                      onClick={saveRename}
                      className="cursor-pointer rounded-lg px-2.5 text-[12px] text-[var(--color-ember)] transition-colors hover:bg-white/[0.04]"
                    >
                      Save
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      openConversation(conversation.id);
                      router.push(talkHref);
                    }}
                    className="block w-full cursor-pointer text-left"
                  >
                    <span className="flex items-center gap-2">
                      {conversation.pinned ? (
                        <span className="inline-flex h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-ember)]/70" aria-hidden />
                      ) : null}
                      <span className="truncate font-serif text-[17px] text-[var(--color-bone)] transition-colors group-hover:text-[var(--color-ember-soft)]">
                        {conversation.title}
                      </span>
                    </span>
                    <span className="mt-0.5 block text-[12px] text-[var(--color-text-tertiary)]">
                      {formatRelativeDay(conversation.updatedAt)} · {conversation.turns.length}{" "}
                      {conversation.turns.length === 1 ? "turn" : "turns"}
                    </span>
                  </button>
                )}
              </div>
              {!editing ? (
                <div className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      toggleConversationPin(conversation.id);
                      void pinConversationDb(conversation.id, !conversation.pinned).catch(console.error);
                    }}
                    className="cursor-pointer rounded-lg px-2.5 py-1.5 text-[12px] text-[var(--color-text-secondary)] transition-colors hover:bg-white/[0.04] hover:text-[var(--color-bone)]"
                  >
                    {conversation.pinned ? "Unpin" : "Pin"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(conversation.id);
                      setDraftTitle(conversation.title);
                    }}
                    className="cursor-pointer rounded-lg px-2.5 py-1.5 text-[12px] text-[var(--color-text-secondary)] transition-colors hover:bg-white/[0.04] hover:text-[var(--color-bone)]"
                  >
                    Rename
                  </button>
                  <button
                    type="button"
                    onClick={() => setPendingDelete({ id: conversation.id, title: conversation.title })}
                    className="cursor-pointer rounded-lg px-2.5 py-1.5 text-[12px] text-[var(--color-text-secondary)] transition-colors hover:bg-white/[0.04] hover:text-[var(--color-danger)]"
                  >
                    Delete
                  </button>
                </div>
              ) : null}
            </motion.div>
          );
        })}
      </motion.div>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete this conversation?"
        body={`"${pendingDelete?.title ?? ""}" and its transcript will be permanently removed.`}
        confirmLabel="Delete conversation"
        onConfirm={() => {
          if (pendingDelete) {
            deleteConversation(pendingDelete.id);
            void deleteConversationDb(pendingDelete.id).catch(console.error);
          }
          setPendingDelete(null);
        }}
        onCancel={() => setPendingDelete(null)}
      />
    </>
  );
}
