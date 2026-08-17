"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ConversationList } from "./ConversationList";
import { exportConversation } from "@/lib/exportConversation";
import { useSession } from "@/lib/session";
import {
  renameConversationDb,
  pinConversationDb,
  deleteConversationDb,
} from "@/lib/db/conversations";
import { persistChange } from "@/lib/db/persistChange";
import type { ConversationRecord } from "@/lib/types";

/**
 * Per-person conversation history, embedded in the person hub.
 *
 * Presentation lives in ConversationList, shared with the in-conversation
 * sheet and the all-conversations page — the two lists used to be written
 * separately and offered different actions for the same conversation.
 */
export function ConversationHistory({
  subjectId,
  voiceId,
  talkHref,
  personName,
}: {
  subjectId: string | null;
  voiceId: string | null;
  talkHref: string;
  personName: string;
}) {
  const router = useRouter();
  const conversations = useSession((s) => s.conversations);
  const openConversation = useSession((s) => s.openConversation);
  const renameConversation = useSession((s) => s.renameConversation);
  const toggleConversationPin = useSession((s) => s.toggleConversationPin);
  const deleteConversation = useSession((s) => s.deleteConversation);
  const restoreConversation = useSession((s) => s.restoreConversation);
  const [pendingDelete, setPendingDelete] = useState<{ id: string; title: string } | null>(null);

  const scoped = conversations.filter(
    (c) => (subjectId && c.subjectId === subjectId) || (voiceId && c.voiceId === voiceId),
  );

  return (
    <>
      <ConversationList
        conversations={scoped}
        showControls
        onExport={(conversation) => exportConversation(conversation, personName)}
        onOpen={(conversation) => {
          openConversation(conversation.id);
          router.push(talkHref);
        }}
        onRead={
          subjectId
            ? (conversation) =>
                router.push(`/people/${subjectId}/conversations/${conversation.id}`)
            : undefined
        }
        onPin={(conversation) => {
          toggleConversationPin(conversation.id);
          void persistChange({
            source: "history-pin",
            run: () => pinConversationDb(conversation.id, !conversation.pinned),
            revert: () => toggleConversationPin(conversation.id),
            describe: conversation.pinned ? "unpin that" : "pin that",
          });
        }}
        onRename={(conversation, title) => {
          const previous = conversation.title;
          renameConversation(conversation.id, title);
          void persistChange({
            source: "history-rename",
            run: () => renameConversationDb(conversation.id, title),
            revert: () => renameConversation(conversation.id, previous),
            describe: "rename that conversation",
          });
        }}
        onDelete={(conversation: ConversationRecord) =>
          setPendingDelete({ id: conversation.id, title: conversation.title })
        }
      />

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete this conversation?"
        body={`"${pendingDelete?.title ?? ""}" and its transcript will be permanently removed.`}
        confirmLabel="Delete conversation"
        onConfirm={() => {
          if (pendingDelete) {
            const record = conversations.find((c) => c.id === pendingDelete.id);
            deleteConversation(pendingDelete.id);
            void persistChange({
              source: "history-delete",
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
    </>
  );
}
