"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { EmptyState } from "@/components/ui/EmptyState";
import { useSession } from "@/lib/session";
import { fadeUp, stagger } from "@/lib/motion";
import { formatRelativeDay } from "@/lib/utils";
import { selectMemories } from "@/lib/memoryView";
import { addMemoryDb, updateMemoryDb, deleteMemoryDb } from "@/lib/db/memories";

/**
 * Per-person memory editor. Everything added here is scoped to one subject
 * and only ever sent into that persona's conversations.
 */
export function MemoryList({ subjectId, personName }: { subjectId: string | null; personName: string }) {
  const memories = useSession((s) => s.memories);
  const addMemoryRecord = useSession((s) => s.addMemoryRecord);
  const replaceMemory = useSession((s) => s.replaceMemory);
  const updateMemory = useSession((s) => s.updateMemory);
  const deleteMemory = useSession((s) => s.deleteMemory);
  const showAuto = useSession((s) => s.prefs.showRememberedFromTalks);
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  // This person's memories, plus legacy unscoped notes from before memories
  // were per-person. Auto-extracted ones stay out unless the page has asked
  // for them — see selectMemories for why that rule lives in one place.
  const scoped = selectMemories(memories, { subjectId, includeAuto: showAuto });

  const saveDraft = () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    // Optimistic, then reconciled to the row's real primary key. The store used
    // to mint its own id here while the database minted a different one, so a
    // later edit or delete matched no row and silently did nothing.
    const localId = crypto.randomUUID();
    const now = Date.now();
    addMemoryRecord({
      id: localId,
      content: trimmed,
      createdAt: now,
      updatedAt: now,
      subjectId,
      source: "manual",
    });
    setDraft("");
    setError(null);
    void addMemoryDb(trimmed, subjectId ?? undefined)
      .then((saved) => replaceMemory(localId, saved))
      .catch(() => {
        // Roll back rather than leave a note on screen that no one is holding.
        deleteMemory(localId);
        setError("That didn't save. Try again in a moment.");
      });
  };

  const saveEdit = () => {
    if (!editingId) return;
    updateMemory(editingId, editingValue);
    void updateMemoryDb(editingId, editingValue).catch(console.error);
    setEditingId(null);
    setEditingValue("");
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[13px] leading-[1.65] text-[var(--color-text-secondary)]">
        Notes {personName} carries into every conversation — dates, names,
        habits, the specifics that would take too long to explain each time.
      </p>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") saveDraft();
          }}
          placeholder={`Something ${personName} should remember`}
          maxLength={500}
          aria-label="Add a memory"
        />
        <Button variant="outline" size="md" onClick={saveDraft} disabled={!draft.trim()}>
          Add
        </Button>
      </div>

      {error ? (
        <p role="alert" className="text-[13px] text-[var(--color-danger)]">
          {error}
        </p>
      ) : null}

      <motion.div initial={false} animate="enter" variants={stagger(0.05)} className="grid gap-2.5">
        {scoped.length ? (
          scoped.map((memory) => {
            const editing = editingId === memory.id;
            const fromTalk = memory.source === "conversation";
            return (
              <motion.div
                key={memory.id}
                variants={fadeUp}
                className={`group flex flex-col gap-3 rounded-xl border p-4 transition-colors duration-300 hover:bg-white/[0.025] sm:flex-row sm:items-center sm:justify-between ${
                  // Revealed auto-captured notes stay visibly secondary, so the
                  // list still reads as a record of what you chose to keep.
                  fromTalk
                    ? "border-dashed border-[var(--color-rule)]/70 bg-transparent"
                    : "border-[var(--color-rule)] bg-white/[0.015]"
                }`}
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
                      aria-label="Edit memory"
                    />
                  ) : (
                    <div className="flex flex-col gap-1">
                      <p
                        className={`text-[14px] leading-[1.6] ${
                          fromTalk ? "text-[var(--color-bone)]/60" : "text-[var(--color-bone)]/90"
                        }`}
                      >
                        {memory.content}
                      </p>
                      <p className="flex items-center gap-2 text-[11px] text-[var(--color-text-tertiary)]">
                        {formatRelativeDay(memory.createdAt)}
                        {fromTalk ? (
                          <span className="rounded-full border border-[var(--color-rule)] px-2 py-0.5">
                            from a conversation
                          </span>
                        ) : null}
                      </p>
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 gap-1">
                  {editing ? (
                    <button
                      type="button"
                      onClick={saveEdit}
                      className="flex min-h-[44px] cursor-pointer items-center rounded-lg px-3 text-[12px] text-[var(--color-ember)] transition-colors hover:bg-white/[0.04]"
                    >
                      Save
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(memory.id);
                        setEditingValue(memory.content);
                      }}
                      className="flex min-h-[44px] cursor-pointer items-center rounded-lg px-3 text-[12px] text-[var(--color-text-secondary)] transition-colors hover:bg-white/[0.04] hover:text-[var(--color-bone)]"
                    >
                      Edit
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      deleteMemory(memory.id);
                      void deleteMemoryDb(memory.id).catch(console.error);
                    }}
                    className="flex min-h-[44px] cursor-pointer items-center rounded-lg px-3 text-[12px] text-[var(--color-text-secondary)] transition-colors hover:bg-white/[0.04] hover:text-[var(--color-danger)]"
                  >
                    Delete
                  </button>
                </div>
              </motion.div>
            );
          })
        ) : (
          <motion.div variants={fadeUp}>
            <EmptyState
              compact
              variant="memories"
              title="Nothing here yet"
              body={`Add a note above and ${personName} will recall it in every conversation.`}
            />
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}
