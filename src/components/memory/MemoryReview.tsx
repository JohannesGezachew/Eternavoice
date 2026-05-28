"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { Mark } from "@/components/shell/Mark";
import { useSession } from "@/lib/session";
import { fadeUp, stagger } from "@/lib/motion";

export function MemoryReview() {
  const memories = useSession((s) => s.memories);
  const addMemory = useSession((s) => s.addMemory);
  const updateMemory = useSession((s) => s.updateMemory);
  const deleteMemory = useSession((s) => s.deleteMemory);
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");

  const saveDraft = () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    addMemory(trimmed);
    setDraft("");
  };

  const startEdit = (id: string, value: string) => {
    setEditingId(id);
    setEditingValue(value);
  };

  const saveEdit = () => {
    if (!editingId) return;
    updateMemory(editingId, editingValue);
    setEditingId(null);
    setEditingValue("");
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
          Back to chat
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
            Memory
          </motion.p>
          <motion.h1 variants={fadeUp} className="font-serif mt-3 text-[38px] leading-[1.08] text-[var(--color-bone)] sm:text-[54px]">
            What it should remember.
          </motion.h1>
          <motion.p variants={fadeUp} className="mt-3 text-[15px] leading-[1.7] text-[var(--color-bone)]/65">
            Notes added here are sent as context at the start of each conversation.
            Dates, habits, names — specifics that would take too long to explain every time.
          </motion.p>
        </motion.div>

        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="mt-10 hairline rounded-2xl bg-white/[0.018] p-5 sm:p-6"
        >
          <p className="mb-3 text-[12px] tracking-[0.14em] text-[var(--color-bone-dim)] uppercase">
            Add a memory
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveDraft();
              }}
              placeholder="A fact, preference, or relationship detail"
              maxLength={500}
            />
            <Button variant="primary" size="md" onClick={saveDraft} disabled={!draft.trim()}>
              Add
            </Button>
          </div>
        </motion.section>

        <motion.div
          initial={false}
          animate="enter"
          variants={stagger(0.06)}
          className="mt-5 grid gap-3"
        >
          {memories.length ? (
            memories.map((memory) => {
              const editing = editingId === memory.id;
              return (
                <motion.section
                  key={memory.id}
                  variants={fadeUp}
                  className="group hairline flex flex-col gap-4 rounded-2xl bg-white/[0.018] p-5 transition-colors duration-300 hover:bg-white/[0.028] sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 flex-1">
                    {editing ? (
                      <Input
                        value={editingValue}
                        onChange={(e) => setEditingValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveEdit();
                          if (e.key === "Escape") setEditingId(null);
                        }}
                        autoFocus
                        maxLength={500}
                      />
                    ) : (
                      <>
                        <p className="text-[15px] leading-[1.65] text-[var(--color-bone)]/88">
                          {memory.content}
                        </p>
                        <p className="mt-2 text-[11px] text-[var(--color-bone-dim)]">
                          Updated {new Date(memory.updatedAt).toLocaleDateString()}
                        </p>
                      </>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {editing ? (
                      <Button variant="outline" size="md" onClick={saveEdit}>
                        Save
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="md"
                        onClick={() => startEdit(memory.id, memory.content)}
                      >
                        Edit
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="md"
                      onClick={() => deleteMemory(memory.id)}
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
                No memories yet.
              </p>
              <p className="mt-2 text-[13px] leading-[1.6] text-[var(--color-bone-dim)]">
                Add a note above — the persona will recall it in every conversation.
              </p>
            </motion.div>
          )}
        </motion.div>
      </main>
    </div>
  );
}
