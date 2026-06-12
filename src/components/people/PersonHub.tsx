"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { PersonaForm } from "@/components/persona/PersonaForm";
import { MemoryList } from "@/components/memory/MemoryList";
import { ConversationHistory } from "@/components/conversation/ConversationHistory";
import { useSession } from "@/lib/session";
import { fadeUp, stagger } from "@/lib/motion";
import { trackEvent } from "@/lib/analytics";
import type { SubjectRow } from "@/lib/db/subjects";
import type { PersonaConfig } from "@/lib/types";

type HubTab = "about" | "memories" | "conversations";

const TABS: Array<{ id: HubTab; label: string }> = [
  { id: "about", label: "Who they are" },
  { id: "memories", label: "Memories" },
  { id: "conversations", label: "Conversations" },
];

/**
 * The person hub: everything about one person in one place — talk to them,
 * shape who they are, manage what they remember, revisit what was said.
 */
export function PersonHub({ subjectId }: { subjectId: string }) {
  const router = useRouter();
  const setActiveVoice = useSession((s) => s.setActiveVoice);
  const setPersona = useSession((s) => s.setPersona);
  const renameVoice = useSession((s) => s.renameVoice);
  const forgetVoice = useSession((s) => s.forgetVoice);
  const activeSubjectId = useSession((s) => s.activeSubjectId);
  const conversations = useSession((s) => s.conversations);

  const [subject, setSubject] = useState<SubjectRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<HubTab>("about");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/user/data")
      .then((r) => r.json())
      .then((d: { subjects?: SubjectRow[] }) => {
        setSubject(d.subjects?.find((s) => s.id === subjectId) ?? null);
      })
      .catch(() => null)
      .finally(() => setLoading(false));
  }, [subjectId]);

  const talkHref = `/people/${subjectId}/talk`;

  const lastConversation = conversations
    .filter((c) => c.subjectId === subjectId || (subject?.voice_id && c.voiceId === subject.voice_id))
    .sort((a, b) => b.updatedAt - a.updatedAt)[0];

  const talk = () => {
    if (!subject?.voice_id) return;
    setActiveVoice(subject.voice_id, subject.id);
    const p = subject.persona as PersonaConfig | null;
    if (p?.name) setPersona(p);
    router.push(talkHref);
  };

  const savePersona = async (next: { name: string; relationship: string; persona: PersonaConfig }) => {
    const res = await fetch(`/api/subjects/${subjectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: next.name,
        relationship: next.relationship,
        persona: next.persona,
      }),
    });
    if (!res.ok) throw new Error("Could not save. Try again.");
    setSubject((prev) =>
      prev ? { ...prev, name: next.name, relationship: next.relationship, persona: next.persona } : prev,
    );
    // Keep the live session in step when this person is active.
    if (subject?.voice_id) renameVoice(subject.voice_id, next.name);
    if (activeSubjectId === subjectId) setPersona(next.persona);
    trackEvent("persona_saved", { from: "hub" });
  };

  const deletePerson = async () => {
    if (!subject) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      if (subject.voice_id) {
        // Best effort — the hosted voice may already be gone.
        await fetch(`/api/voices/${encodeURIComponent(subject.voice_id)}`, { method: "DELETE" }).catch(
          () => null,
        );
      }
      const res = await fetch(`/api/subjects/${subjectId}`, { method: "DELETE" });
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(json?.error || "Could not delete.");
      }
      if (subject.voice_id) forgetVoice(subject.voice_id);
      trackEvent("person_deleted");
      router.push("/people");
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Could not delete.");
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center py-24">
        <motion.span
          className="inline-block h-5 w-5 rounded-full border-2 border-[var(--color-bone-dim)]/20 border-t-[var(--color-bone-dim)]"
          animate={{ rotate: 360 }}
          transition={{ duration: 0.9, repeat: Infinity, ease: "linear" }}
          aria-label="Loading"
          role="status"
        />
      </div>
    );
  }

  if (!subject) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-24 text-center">
        <p className="font-serif text-[22px] text-[var(--color-bone)]/80">Person not found</p>
        <button
          onClick={() => router.push("/people")}
          className="cursor-pointer text-[13px] text-[var(--color-ember)] underline underline-offset-4 transition hover:opacity-75"
        >
          Back to your people
        </button>
      </div>
    );
  }

  const persona = (subject.persona ?? { mode: "persona", name: subject.name }) as PersonaConfig;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 pb-16 pt-8 sm:px-8">
      <motion.div initial="hidden" animate="enter" variants={stagger(0.07)} className="flex flex-col gap-8">
        {/* ── Identity ───────────────────────────────────────────── */}
        <motion.header variants={fadeUp} className="flex flex-col items-start gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-5">
            <div className="relative h-16 w-16 shrink-0" aria-hidden>
              <div
                className="absolute inset-[-25%] rounded-full opacity-60 blur-[18px]"
                style={{ background: "radial-gradient(closest-side, rgba(201,153,106,0.35), transparent 75%)" }}
              />
              <div className="absolute inset-0 rounded-full border border-[var(--color-rule-strong)] bg-[radial-gradient(closest-side,rgba(201,153,106,0.12),transparent_75%)]" />
              <span className="absolute inset-0 flex items-center justify-center font-serif text-[26px] text-[var(--color-ember)]">
                {subject.name.trim().charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="flex min-w-0 flex-col gap-1">
              <h1 className="font-serif text-[30px] leading-tight tracking-[-0.02em] text-[var(--color-bone)] sm:text-[36px]">
                {subject.name}
              </h1>
              <div className="flex flex-wrap items-center gap-2">
                {subject.relationship ? (
                  <span className="inline-flex items-center rounded-full border border-[var(--color-rule)] bg-white/[0.04] px-2.5 py-0.5 text-[11px] text-[var(--color-text-secondary)]">
                    {subject.relationship}
                  </span>
                ) : null}
                <span className="text-[12px] text-[var(--color-text-tertiary)]">
                  Added{" "}
                  {new Date(subject.created_at).toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </span>
              </div>
            </div>
          </div>
        </motion.header>

        {/* ── Talk ───────────────────────────────────────────────── */}
        <motion.div
          variants={fadeUp}
          className="flex flex-col gap-4 rounded-2xl border border-[var(--color-rule)] bg-white/[0.018] p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6"
        >
          <div className="flex flex-col gap-1">
            <p className="text-[15px] text-[var(--color-bone)]">
              {lastConversation
                ? `Last spoke ${relativeDay(lastConversation.updatedAt)} · ${lastConversation.turns.length} turns`
                : "You haven't spoken yet."}
            </p>
            <p className="text-[12px] text-[var(--color-text-tertiary)]">
              {lastConversation
                ? "Pick up where you left off, or start fresh."
                : `${subject.name} will speak first.`}
            </p>
          </div>
          <Button variant="primary" size="lg" onClick={talk} className="w-full sm:w-auto">
            Talk to {subject.name}
          </Button>
        </motion.div>

        {/* ── Tabs ───────────────────────────────────────────────── */}
        <motion.div variants={fadeUp} className="flex flex-col gap-6">
          <div
            role="tablist"
            aria-label={`About ${subject.name}`}
            className="flex w-full gap-1 rounded-xl border border-[var(--color-rule)] bg-white/[0.015] p-1"
          >
            {TABS.map(({ id, label }) => (
              <button
                key={id}
                role="tab"
                aria-selected={tab === id}
                onClick={() => setTab(id)}
                className={`flex-1 cursor-pointer rounded-lg px-3 py-2 text-[13px] transition-colors duration-200 ${
                  tab === id
                    ? "bg-white/[0.06] text-[var(--color-bone)]"
                    : "text-[var(--color-text-secondary)] hover:text-[var(--color-bone)]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="rounded-2xl border border-[var(--color-rule)] bg-white/[0.018] p-5 sm:p-7">
            {tab === "about" ? (
              <PersonaForm
                key={subject.id}
                initialName={subject.name}
                initialRelationship={subject.relationship ?? ""}
                initialPersona={persona}
                onSave={savePersona}
              />
            ) : tab === "memories" ? (
              <MemoryList subjectId={subjectId} personName={subject.name} />
            ) : (
              <ConversationHistory
                subjectId={subjectId}
                voiceId={subject.voice_id}
                talkHref={talkHref}
              />
            )}
          </div>
        </motion.div>

        {/* ── Remove ─────────────────────────────────────────────── */}
        <motion.div variants={fadeUp} className="flex flex-col items-start gap-2 border-t border-[var(--color-rule)] pt-6">
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="cursor-pointer text-[13px] text-[var(--color-text-tertiary)] underline underline-offset-4 transition-colors hover:text-[var(--color-danger)]"
          >
            Remove {subject.name} from EternaVoice
          </button>
          {deleteError ? (
            <p className="text-[13px] text-[var(--color-danger)]" role="alert">
              {deleteError}
            </p>
          ) : null}
        </motion.div>
      </motion.div>

      <ConfirmDialog
        open={confirmDelete}
        title={`Remove ${subject.name}?`}
        body="Their voice, persona, memories, and conversations will be permanently deleted. This cannot be undone."
        confirmLabel="Remove permanently"
        loading={deleting}
        onConfirm={() => void deletePerson()}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}

function relativeDay(ts: number): string {
  const days = Math.floor((Date.now() - ts) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  return new Date(ts).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
