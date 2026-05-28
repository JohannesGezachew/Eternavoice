"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { Mark } from "@/components/shell/Mark";
import { useSession } from "@/lib/session";
import { fadeUp, stagger } from "@/lib/motion";

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

  const sorted = [...conversations].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return b.updatedAt - a.updatedAt;
  });

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
        <motion.div
          initial={false}
          animate="enter"
          variants={stagger(0.06)}
          className="max-w-2xl"
        >
          <motion.p variants={fadeUp} className="text-[12px] tracking-[0.22em] text-[var(--color-bone-dim)] uppercase">
            History
          </motion.p>
          <motion.h1 variants={fadeUp} className="font-serif mt-3 text-[38px] leading-[1.08] text-[var(--color-bone)] sm:text-[54px]">
            Pick up where you left off.
          </motion.h1>
          <motion.p variants={fadeUp} className="mt-3 text-[15px] leading-[1.7] text-[var(--color-bone)]/65">
            Saved conversations on this device. Pin the ones you want to keep
            close, rename them, or delete what you no longer need.
          </motion.p>
        </motion.div>

        <motion.div
          initial={false}
          animate="enter"
          variants={stagger(0.07)}
          className="mt-10 grid gap-3"
        >
          {sorted.length ? (
            sorted.map((conversation) => {
              const editing = editingId === conversation.id;
              const isCurrent = conversation.id === currentConversationId;
              return (
                <motion.section
                  key={conversation.id}
                  variants={fadeUp}
                  className="group hairline flex flex-col gap-4 rounded-2xl bg-white/[0.018] p-5 transition-colors duration-300 hover:bg-white/[0.028] sm:flex-row sm:items-center sm:justify-between"
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
                        <div className="flex items-center gap-2.5">
                          {conversation.pinned ? (
                            <span className="inline-flex h-1.5 w-1.5 rounded-full bg-[var(--color-ember)]/60" aria-hidden />
                          ) : null}
                          <h2 className="truncate font-serif text-[24px] text-[var(--color-bone)]">
                            {conversation.title}
                          </h2>
                          {isCurrent ? (
                            <span className="shrink-0 rounded-full border border-[var(--color-ember)]/30 bg-[var(--color-ember)]/[0.07] px-2 py-0.5 text-[10px] tracking-[0.12em] text-[var(--color-ember)] uppercase">
                              Current
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-1 text-[12px] text-[var(--color-bone-dim)]">
                          {conversation.voiceName} · {conversation.turns.length}{" "}
                          {conversation.turns.length === 1 ? "turn" : "turns"} ·{" "}
                          {new Date(conversation.updatedAt).toLocaleDateString()}
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
                </motion.section>
              );
            })
          ) : (
            <motion.div variants={fadeUp} className="hairline rounded-2xl bg-white/[0.018] p-10 text-center">
              <div className="mx-auto mb-5 flex h-10 w-10 items-center justify-center rounded-full border border-[var(--color-rule-strong)] bg-[var(--color-ember)]/[0.06]">
                <span className="inline-block h-2 w-2 rounded-full bg-[var(--color-ember)]/70" />
              </div>
              <p className="text-[15px] text-[var(--color-bone)]/75">
                No conversations saved yet.
              </p>
              <p className="mt-2 text-[13px] leading-[1.6] text-[var(--color-bone-dim)]">
                Start a conversation and it will appear here after the first exchange.
              </p>
              <div className="mt-6">
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
            </motion.div>
          )}
        </motion.div>
      </main>
    </div>
  );
}
