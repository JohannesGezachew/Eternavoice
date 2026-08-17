"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { AppShell } from "@/components/shell/AppShell";
import { MemoryList } from "@/components/memory/MemoryList";
import { EmptyState } from "@/components/ui/EmptyState";
import { useSession } from "@/lib/session";
import { selectMemories, countAutoMemories, searchMemories } from "@/lib/memoryView";
import { Input } from "@/components/ui/Field";
import { fadeUp, stagger } from "@/lib/motion";
import { createClient } from "@/lib/supabase/client";
import type { SubjectRow } from "@/lib/db/subjects";

export default function MemoriesPage() {
  const memories = useSession((s) => s.memories);
  const showAuto = useSession((s) => s.prefs.showRememberedFromTalks);
  const setPrefs = useSession((s) => s.setPrefs);
  const [subjects, setSubjects] = useState<SubjectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

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
  //
  // Except when there is nothing of your own yet — which is most people, since
  // the summariser captures constantly and the bookmark is opt-in. An empty
  // page sitting beside "80 more remembered from your conversations" reads as
  // broken, and is the single worst thing to show someone who has been talking
  // for weeks. So with no kept notes, theirs are shown instead.
  const heldBack = countAutoMemories(memories);
  const keptCount = memories.length - heldBack;
  const revealed = showAuto || keptCount === 0;
  const visibleMemories = selectMemories(memories, { includeAuto: revealed });

  // Searched before grouping, so a person with no match drops out of the page
  // entirely rather than sitting there as an empty heading.
  const matching = searchMemories(visibleMemories, query);

  const grouped = subjects
    .filter((s) => matching.some((m) => m.subjectId === s.id))
    .map((s) => ({
      subject: s,
      count: matching.filter((m) => m.subjectId === s.id).length,
    }))
    .sort((a, b) => b.count - a.count);

  const unscopedCount = matching.filter((m) => !m.subjectId).length;

  return (
    <AppShell title="Memories" showTabs>
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 pb-16 pt-8 sm:px-8">
        <motion.div initial="hidden" animate="enter" variants={stagger(0.07)} className="flex flex-col gap-8">
          <motion.div variants={fadeUp} className="flex flex-col gap-1.5">
            <h1 className="font-serif text-display leading-tight tracking-[-0.02em] text-[var(--color-bone)]">
              Memories
            </h1>
            <p className="text-body leading-[1.7] text-[var(--color-text-secondary)]">
              Notes carried into every conversation — saved from talks, or added by hand.
            </p>
            {/* The count is the control: it says the other memories exist
                without turning the page into a settings screen. */}
            {heldBack > 0 ? (
              <p className="mt-1 flex flex-wrap items-center gap-2 text-small text-[var(--color-text-tertiary)]">
                {keptCount === 0
                  ? "You haven't kept any by hand yet — showing what they remembered from your conversations."
                  : showAuto
                    ? "Showing everything they remember."
                    : `${heldBack} more remembered from your conversations.`}
                {/* No toggle when there is nothing of your own to toggle back
                    to — it would only ever reveal an empty page. */}
                {keptCount > 0 ? (
                  <button
                    type="button"
                    onClick={() => setPrefs({ showRememberedFromTalks: !showAuto })}
                    aria-pressed={showAuto}
                    className="cursor-pointer text-[var(--color-bone-dim)] underline underline-offset-4 transition hover:text-[var(--color-bone)]"
                  >
                    {showAuto ? "Show only what you saved" : "Show"}
                  </button>
                ) : null}
              </p>
            ) : null}
          </motion.div>

          {/* A memory list grows without limit — the summariser captures on
              every conversation — so someone six months in has hundreds, and
              checking whether they had already written down their father's
              birthday meant reading the whole page. */}
          {!loading && visibleMemories.length > 6 ? (
            <motion.div variants={fadeUp}>
              <Input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search everything you've kept"
                aria-label="Search memories"
              />
            </motion.div>
          ) : null}

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
                title={query.trim() ? "Nothing matches that" : "Nothing here yet"}
                body={
                  query.trim()
                    ? "No memory mentions that. Try a single word — a name, a place, a date."
                    : "Memories are saved during conversations when something worth keeping comes up — or add your own on a person's page."
                }
              />
            </motion.div>
          ) : (
            <>
              {grouped.map(({ subject }) => (
                <motion.section key={subject.id} variants={fadeUp} className="flex flex-col gap-4">
                  <div className="flex items-center gap-3">
                    <h2 className="font-serif text-title text-[var(--color-bone)]">{subject.name}</h2>
                    {subject.relationship && (
                      <span className="rounded-full border border-[var(--color-rule)] px-2.5 py-0.5 text-micro text-[var(--color-text-secondary)]">
                        {subject.relationship}
                      </span>
                    )}
                  </div>
                  <div className="rounded-2xl border border-[var(--color-rule)] bg-white/[0.018] p-5 sm:p-6">
                    <MemoryList subjectId={subject.id} personName={subject.name} query={query} />
                  </div>
                </motion.section>
              ))}

              {unscopedCount > 0 && (
                <motion.section variants={fadeUp} className="flex flex-col gap-4">
                  <h2 className="font-serif text-title text-[var(--color-bone)]">General</h2>
                  <div className="rounded-2xl border border-[var(--color-rule)] bg-white/[0.018] p-5 sm:p-6">
                    <MemoryList subjectId={null} personName="everyone" query={query} />
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
