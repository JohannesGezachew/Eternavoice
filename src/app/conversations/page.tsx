"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { AppShell } from "@/components/shell/AppShell";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ConversationList } from "@/components/conversation/ConversationList";
import { useSession } from "@/lib/session";
import { fadeUp, stagger } from "@/lib/motion";
import { cn } from "@/lib/utils";
import {
  renameConversationDb,
  pinConversationDb,
  deleteConversationDb,
} from "@/lib/db/conversations";
import { persistChange } from "@/lib/db/persistChange";
import { exportConversation } from "@/lib/exportConversation";
import type { SubjectRow } from "@/lib/db/subjects";
import type { ConversationRecord } from "@/lib/types";

/**
 * Every conversation, across everyone.
 *
 * This route used to redirect to /people, which meant finding a conversation
 * required remembering which person it was with, then digging two levels into
 * their hub. Searching for something someone said is the reason people come
 * back — it deserves a page.
 */
export default function ConversationsPage() {
  const router = useRouter();
  const conversations = useSession((s) => s.conversations);
  const dbSettled = useSession((s) => s.dbSettled);
  const openConversation = useSession((s) => s.openConversation);
  const renameConversation = useSession((s) => s.renameConversation);
  const toggleConversationPin = useSession((s) => s.toggleConversationPin);
  const deleteConversation = useSession((s) => s.deleteConversation);
  const restoreConversation = useSession((s) => s.restoreConversation);

  const [subjects, setSubjects] = useState<SubjectRow[]>([]);
  const [personFilter, setPersonFilter] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{ id: string; title: string } | null>(null);

  useEffect(() => {
    fetch("/api/user/data")
      .then((r) => r.json())
      .then((d: { subjects?: SubjectRow[] }) => setSubjects(d.subjects ?? []))
      .catch(() => null);
  }, []);

  const subjectById = useMemo(() => {
    const map = new Map<string, SubjectRow>();
    for (const s of subjects) map.set(s.id, s);
    return map;
  }, [subjects]);

  // Only offer the filter for people who actually have conversations — an
  // empty chip is a dead end.
  const peopleWithConversations = useMemo(
    () =>
      subjects.filter((s) =>
        conversations.some(
          (c) => c.subjectId === s.id || (s.voice_id && c.voiceId === s.voice_id),
        ),
      ),
    [subjects, conversations],
  );

  const belongsTo = (conversation: ConversationRecord, subject: SubjectRow) =>
    conversation.subjectId === subject.id ||
    Boolean(subject.voice_id && conversation.voiceId === subject.voice_id);

  const visible = useMemo(() => {
    if (!personFilter) return conversations;
    const subject = subjectById.get(personFilter);
    if (!subject) return conversations;
    return conversations.filter((c) => belongsTo(c, subject));
  }, [conversations, personFilter, subjectById]);

  const subjectIdFor = (conversation: ConversationRecord): string | null => {
    if (conversation.subjectId) return conversation.subjectId;
    const match = subjects.find(
      (s) => s.voice_id && conversation.voiceId === s.voice_id,
    );
    return match?.id ?? null;
  };

  const nameFor = (conversation: ConversationRecord): string | null => {
    const id = subjectIdFor(conversation);
    return id ? (subjectById.get(id)?.name ?? null) : null;
  };

  const openInRoom = (conversation: ConversationRecord) => {
    openConversation(conversation.id);
    const id = subjectIdFor(conversation);
    router.push(id ? `/people/${id}/talk` : "/people/current/talk");
  };

  return (
    <AppShell title="Conversations" showTabs>
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 pb-16 pt-8 sm:px-8">
        <motion.div initial="hidden" animate="enter" variants={stagger(0.07)} className="flex flex-col gap-6">
          <motion.div variants={fadeUp} className="flex flex-col gap-1.5">
            <h1 className="font-serif text-display leading-tight tracking-[-0.02em] text-[var(--color-bone)]">
              Conversations
            </h1>
            <p className="text-body leading-[1.7] text-[var(--color-text-secondary)]">
              Everything you&rsquo;ve said, with everyone — searchable, and kept.
            </p>
          </motion.div>

          {peopleWithConversations.length > 1 ? (
            <motion.div variants={fadeUp} className="flex flex-wrap gap-2" role="group" aria-label="Filter by person">
              <FilterChip active={personFilter === null} onClick={() => setPersonFilter(null)}>
                Everyone
              </FilterChip>
              {peopleWithConversations.map((subject) => (
                <FilterChip
                  key={subject.id}
                  active={personFilter === subject.id}
                  onClick={() => setPersonFilter(subject.id)}
                >
                  {subject.name}
                </FilterChip>
              ))}
            </motion.div>
          ) : null}

          {/* The store starts empty and fills from the database a beat later,
              so this page opened on "Nothing here yet" for someone with a
              hundred conversations. Skeleton until the load has settled —
              anything is kinder than telling them it is gone. */}
          {!dbSettled && conversations.length === 0 ? (
            <motion.div variants={fadeUp} className="flex flex-col gap-3" role="status" aria-label="Loading">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-20 animate-pulse rounded-2xl bg-white/[0.03]" />
              ))}
            </motion.div>
          ) : (
          <motion.div variants={fadeUp}>
            <ConversationList
              conversations={visible}
              showControls
              onExport={(conversation) =>
                exportConversation(conversation, nameFor(conversation) ?? "Them")
              }
              personNameFor={personFilter ? undefined : nameFor}
              onOpen={openInRoom}
              onRead={(conversation) => {
                const id = subjectIdFor(conversation);
                if (id) router.push(`/people/${id}/conversations/${conversation.id}`);
                else openInRoom(conversation);
              }}
              onPin={(conversation) => {
                toggleConversationPin(conversation.id);
                void persistChange({
                  source: "conversations-pin",
                  run: () => pinConversationDb(conversation.id, !conversation.pinned),
                  revert: () => toggleConversationPin(conversation.id),
                  describe: conversation.pinned ? "unpin that" : "pin that",
                });
              }}
              onRename={(conversation, title) => {
                const previous = conversation.title;
                renameConversation(conversation.id, title);
                void persistChange({
                  source: "conversations-rename",
                  run: () => renameConversationDb(conversation.id, title),
                  revert: () => renameConversation(conversation.id, previous),
                  describe: "rename that conversation",
                });
              }}
              onDelete={(conversation) =>
                setPendingDelete({ id: conversation.id, title: conversation.title })
              }
              emptyTitle="Nothing here yet"
              emptyBody="Once you've talked with someone, every conversation is kept here."
            />
          </motion.div>
          )}
        </motion.div>
      </div>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete this conversation?"
        body={`"${pendingDelete?.title ?? ""}" and its transcript will be permanently removed.`}
        confirmLabel="Delete conversation"
        onConfirm={() => {
          if (pendingDelete) {
            // Captured before the store drops it, so a failed delete can put
            // the whole record back rather than a stub.
            const record = conversations.find((c) => c.id === pendingDelete.id);
            deleteConversation(pendingDelete.id);
            void persistChange({
              source: "conversations-delete",
              run: () => deleteConversationDb(pendingDelete.id),
              revert: () => {
                if (record) restoreConversation(record);
              },
              describe: "delete that conversation",
            });
          }
          setPendingDelete(null);
        }}
        onCancel={() => setPendingDelete(null)}
      />
    </AppShell>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex h-9 cursor-pointer items-center rounded-full border px-3.5 text-small transition-colors duration-200",
        active
          ? "border-[var(--color-ember)]/40 bg-[var(--color-ember)]/[0.08] text-[var(--color-bone)]"
          : "border-[var(--color-rule-strong)] text-[var(--color-text-secondary)] hover:text-[var(--color-bone)]",
      )}
    >
      {children}
    </button>
  );
}
