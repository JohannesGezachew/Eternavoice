"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { Mark } from "@/components/shell/Mark";
import { useSession } from "@/lib/session";

export function MemoryReview() {
  const memories = useSession((s) => s.memories);
  const addMemory = useSession((s) => s.addMemory);
  const updateMemory = useSession((s) => s.updateMemory);
  const deleteMemory = useSession((s) => s.deleteMemory);
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");

  const saveDraft = () => {
    addMemory(draft);
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
        <div className="max-w-2xl space-y-3">
          <p className="text-[12px] tracking-[0.22em] text-[var(--color-bone-dim)] uppercase">
            Memory
          </p>
          <h1 className="font-serif text-[38px] leading-[1.08] text-[var(--color-bone)] sm:text-[54px]">
            Review what it should remember.
          </h1>
          <p className="text-[15px] leading-[1.7] text-[var(--color-bone)]/68">
            These notes are saved on this device and sent as context during chats.
            Cross-device memory still requires accounts and a database.
          </p>
        </div>

        <section className="mt-10 hairline rounded-2xl bg-white/[0.018] p-5 sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row">
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveDraft();
              }}
              placeholder="Add a fact, preference, or relationship detail"
              maxLength={500}
            />
            <Button variant="primary" size="md" onClick={saveDraft}>
              Add
            </Button>
          </div>
        </section>

        <div className="mt-5 grid gap-3">
          {memories.length ? (
            memories.map((memory) => {
              const editing = editingId === memory.id;
              return (
                <section
                  key={memory.id}
                  className="hairline flex flex-col gap-4 rounded-2xl bg-white/[0.018] p-5 sm:flex-row sm:items-center sm:justify-between"
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
                </section>
              );
            })
          ) : (
            <div className="hairline rounded-2xl bg-white/[0.018] p-7">
              <p className="text-[15px] text-[var(--color-bone)]/75">
                No reviewed memories yet.
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
