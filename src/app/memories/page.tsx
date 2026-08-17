"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { AppShell } from "@/components/shell/AppShell";
import { MemoryList } from "@/components/memory/MemoryList";
import { EmptyState } from "@/components/ui/EmptyState";
import { useSession } from "@/lib/session";
import { selectMemories, countAutoMemories } from "@/lib/memoryView";
import { fadeUp, stagger } from "@/lib/motion";
import { createClient } from "@/lib/supabase/client";
import type { SubjectRow } from "@/lib/db/subjects";

export default function MemoriesPage() {
  const memories = useSession((s) => s.memories);
  const showAuto = useSession((s) => s.prefs.showRememberedFromTalks);
  const setPrefs = useSession((s) => s.setPrefs);
  const [subjects, setSubjects] = useState<SubjectRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { setLoading(false); return; }
      fetch("/api/user/data")
        .then((r) => r.json())
        .then((d: { subjects?: SubjectRow[] }) => {
          if (d.subjects) setSubjects(d.subjects);
        })
        .catch(() => null)
        .finally(() => setLoading(false));
    });
  }, []);

  // By default only what the user kept by hand: the summariser's auto-extracted
  // memories are real and the personas use them, but this list is meant to read
  // as a record of your own choices. The count below opens them up.
  const visibleMemories = selectMemories(memories, { includeAuto: showAuto });
  const heldBack = countAutoMemories(memories);

  // Group memories by subjectId
  const grouped = subjects
    .filter((s) => visibleMemories.some((m) => m.subjectId === s.id))
    .map((s) => ({
      subject: s,
      count: visibleMemories.filter((m) => m.subjectId === s.id).length,
    }))
    .sort((a, b) => b.count - a.count);

  const unscopedCount = visibleMemories.filter((m) => !m.subjectId).length;

  return (
    <AppShell title="Memories" showTabs>
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 pb-16 pt-8 sm:px-8">
        <motion.div initial="hidden" animate="enter" variants={stagger(0.07)} className="flex flex-col gap-8">
          <motion.div variants={fadeUp} className="flex flex-col gap-1.5">
            <h1 className="font-serif text-[28px] leading-tight tracking-[-0.02em] text-[var(--color-bone)] sm:text-[34px]">
              Memories
            </h1>
            <p className="text-[14px] leading-[1.7] text-[var(--color-text-secondary)]">
              Notes carried into every conversation — saved from talks, or added by hand.
            </p>
            {/* The count is the control: it says the other memories exist
                without turning the page into a settings screen. */}
            {heldBack > 0 || showAuto ? (
              <p className="mt-1 flex flex-wrap items-center gap-2 text-[13px] text-[var(--color-text-tertiary)]">
                {showAuto
                  ? "Showing everything they remember."
                  : `${heldBack} more remembered from your conversations.`}
                <button
                  type="button"
                  onClick={() => setPrefs({ showRememberedFromTalks: !showAuto })}
                  aria-pressed={showAuto}
                  className="cursor-pointer text-[var(--color-bone-dim)] underline underline-offset-4 transition hover:text-[var(--color-bone)]"
                >
                  {showAuto ? "Show only what you saved" : "Show"}
                </button>
              </p>
            ) : null}
          </motion.div>

          {loading ? (
            <div className="flex flex-col gap-4">
              {[0, 1].map((i) => (
                <div key={i} className="h-40 animate-pulse rounded-2xl bg-white/[0.03]" />
              ))}
            </div>
          ) : grouped.length === 0 && unscopedCount === 0 ? (
            <motion.div variants={fadeUp}>
              <EmptyState
                variant="memories"
                title="Nothing here yet"
                body="Memories are saved during conversations when something worth keeping comes up — or add your own on a person's page."
              />
            </motion.div>
          ) : (
            <>
              {grouped.map(({ subject }) => (
                <motion.section key={subject.id} variants={fadeUp} className="flex flex-col gap-4">
                  <div className="flex items-center gap-3">
                    <h2 className="font-serif text-[20px] text-[var(--color-bone)]">{subject.name}</h2>
                    {subject.relationship && (
                      <span className="rounded-full border border-[var(--color-rule)] px-2.5 py-0.5 text-[11px] text-[var(--color-text-secondary)]">
                        {subject.relationship}
                      </span>
                    )}
                  </div>
                  <div className="rounded-2xl border border-[var(--color-rule)] bg-white/[0.018] p-5 sm:p-6">
                    <MemoryList subjectId={subject.id} personName={subject.name} />
                  </div>
                </motion.section>
              ))}

              {unscopedCount > 0 && (
                <motion.section variants={fadeUp} className="flex flex-col gap-4">
                  <h2 className="font-serif text-[20px] text-[var(--color-bone)]">General</h2>
                  <div className="rounded-2xl border border-[var(--color-rule)] bg-white/[0.018] p-5 sm:p-6">
                    <MemoryList subjectId={null} personName="everyone" />
                  </div>
                </motion.section>
              )}
            </>
          )}
        </motion.div>
      </div>
    </AppShell>
  );
}
