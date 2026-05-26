"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { Mark } from "@/components/shell/Mark";
import { useSession } from "@/lib/session";

export function ConversationList() {
  const router = useRouter();
  const conversations = useSession((s) => s.conversations);
  const currentConversationId = useSession((s) => s.currentConversationId);
  const openConversation = useSession((s) => s.openConversation);
  const renameConversation = useSession((s) => s.renameConversation);
  const toggleConversationPin = useSession((s) => s.toggleConversationPin);
  const deleteConversation = useSession((s) => s.deleteConversation);
  const newConversation = useSession((s) => s.newConversation);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");

  const startRename = (id: string, title: string) => {
    setEditingId(id);
    setDraftTitle(title);
  };

  const saveRename = () => {
    if (!editingId) return;
    renameConversation(editingId, draftTitle);
    setEditingId(null);
    setDraftTitle("");
  };

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-6 py-6 sm:px-8">
      <header className="flex items-center justify-between">
        <Link href="/" aria-label="Home" className="-mx-1 px-1">
          <Mark />
        </Link>
        <Link
          href="/conversation"
          className="text-[12px] text-[var(--color-bone-dim)] transition hover:text-[var(--color-bone)]"
        >
          Current chat
        </Link>
      </header>

      <main className="py-12">
        <div className="max-w-2xl space-y-3">
          <p className="text-[12px] tracking-[0.22em] text-[var(--color-bone-dim)] uppercase">
            Conversations
          </p>
          <h1 className="font-serif text-[38px] leading-[1.08] text-[var(--color-bone)] sm:text-[54px]">
            Pick up where you left off.
          </h1>
          <p className="text-[15px] leading-[1.7] text-[var(--color-bone)]/68">
            These conversations are saved on this device. Account-backed sync is
            still required before they can follow a user across devices.
          </p>
        </div>

        <div className="mt-10 grid gap-3">
          {conversations.length ? (
            conversations.map((conversation) => {
              const editing = editingId === conversation.id;
              return (
                <section
                  key={conversation.id}
                  className="hairline flex flex-col gap-4 rounded-2xl bg-white/[0.018] p-5 sm:flex-row sm:items-center sm:justify-between"
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
                        />
                        <Button variant="outline" size="md" onClick={saveRename}>
                          Save
                        </Button>
                      </div>
                    ) : (
                      <>
                        <h2 className="truncate font-serif text-[24px] text-[var(--color-bone)]">
                          {conversation.pinned ? "Pinned · " : ""}
                          {conversation.title}
                        </h2>
                        <p className="mt-1 text-[12px] text-[var(--color-bone-dim)]">
                          {conversation.voiceName} · {conversation.turns.length} turns · Updated{" "}
                          {new Date(conversation.updatedAt).toLocaleDateString()}
                          {conversation.id === currentConversationId ? " · Current" : ""}
                        </p>
                      </>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="primary"
                      size="md"
                      onClick={() => {
                        openConversation(conversation.id);
                        router.push("/conversation");
                      }}
                    >
                      Open
                    </Button>
                    <Button
                      variant="outline"
                      size="md"
                      onClick={() => toggleConversationPin(conversation.id)}
                    >
                      {conversation.pinned ? "Unpin" : "Pin"}
                    </Button>
                    <Button
                      variant="outline"
                      size="md"
                      onClick={() => startRename(conversation.id, conversation.title)}
                    >
                      Rename
                    </Button>
                    <Button
                      variant="ghost"
                      size="md"
                      onClick={() => deleteConversation(conversation.id)}
                    >
                      Delete
                    </Button>
                  </div>
                </section>
              );
            })
          ) : (
            <div className="hairline rounded-2xl bg-white/[0.018] p-7">
              <p className="text-[15px] text-[var(--color-bone)]/75">
                No saved conversations on this device yet.
              </p>
              <div className="mt-5">
                <Button
                  variant="primary"
                  size="md"
                  onClick={() => {
                    newConversation();
                    router.push("/conversation");
                  }}
                >
                  Start a conversation
                </Button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
