"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { buttonClasses } from "@/components/ui/buttonClasses";
import { EmptyState } from "@/components/ui/EmptyState";
import { LOAD_FAILED_TITLE, LOAD_FAILED_BODY } from "@/lib/loadState";
import { FadeSwap } from "@/components/ui/FadeSwap";
import { PersonaForm } from "@/components/persona/PersonaForm";
import { MemoryList } from "@/components/memory/MemoryList";
import { ConversationHistory } from "@/components/conversation/ConversationHistory";
import { PersonAvatar } from "./PersonAvatar";
import { useSession } from "@/lib/session";
import { fadeUp, stagger } from "@/lib/motion";
import { trackEvent } from "@/lib/analytics";
import { formatRelativeDay } from "@/lib/utils";
import { isArchived, describeCorpusQuality } from "@/lib/peopleView";
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
  const [loadFailed, setLoadFailed] = useState(false);
  // null means "not chosen yet", so the default can follow the data without
  // adjusting state in an effect once conversations hydrate.
  const [chosenTab, setChosenTab] = useState<HubTab | null>(null);
  const [editingPersona, setEditingPersona] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteNameInput, setDeleteNameInput] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [archiving, setArchiving] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/user/data")
      .then((r) => r.json())
      .then((d: { subjects?: SubjectRow[] }) => {
        setSubject(d.subjects?.find((s) => s.id === subjectId) ?? null);
      })
      .catch(() => setLoadFailed(true))
      .finally(() => setLoading(false));
  }, [subjectId]);

  const talkHref = `/people/${subjectId}/talk`;

  const theirConversations = conversations.filter(
    (c) => c.subjectId === subjectId || (subject?.voice_id && c.voiceId === subject.voice_id),
  );
  const lastConversation = [...theirConversations].sort((a, b) => b.updatedAt - a.updatedAt)[0];

  // Someone returning to a person they have talked with is far more likely to
  // want to continue or revisit than to edit who they are, so conversations
  // lead once there are any. "Who they are" stays the opening for a new person.
  const tab: HubTab = chosenTab ?? (theirConversations.length ? "conversations" : "about");

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

  const toggleArchive = async () => {
    if (!subject) return;
    const next = !isArchived(subject);
    setArchiving(true);
    setArchiveError(null);
    try {
      const res = await fetch(`/api/subjects/${subjectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived: next }),
      });
      if (!res.ok) throw new Error("Could not save that.");
      // Mirrored locally rather than refetched: the exact timestamp doesn't
      // matter here, only whether one exists.
      setSubject((prev) =>
        prev ? { ...prev, archived_at: next ? new Date().toISOString() : null } : prev,
      );
      trackEvent(next ? "person_archived" : "person_unarchived");
    } catch {
      setArchiveError("Could not save that. Try again in a moment.");
    } finally {
      setArchiving(false);
    }
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

  const state = loading
    ? "loading"
    // A failed fetch is not a missing person.
    : loadFailed && !subject
      ? "failed"
      : !subject
        ? "missing"
        : "ready";

  if (loading || !subject) {
    return (
      <FadeSwap swapKey={state}>
        {loading ? (
          <div
            className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-6 pb-16 pt-8 sm:px-8"
            role="status"
            aria-label="Loading"
          >
            <div className="flex items-center gap-5">
              <div className="h-16 w-16 animate-pulse rounded-full bg-white/[0.04]" />
              <div className="flex flex-col gap-2">
                <div className="h-8 w-44 animate-pulse rounded-lg bg-white/[0.04]" />
                <div className="h-4 w-28 animate-pulse rounded-md bg-white/[0.03]" />
              </div>
            </div>
            <div className="h-24 animate-pulse rounded-2xl bg-white/[0.03]" />
            <div className="h-12 animate-pulse rounded-xl bg-white/[0.03]" />
            <div className="h-64 animate-pulse rounded-2xl bg-white/[0.025]" />
          </div>
        ) : (
          <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-24">
            <EmptyState
              variant="people"
              title={loadFailed ? LOAD_FAILED_TITLE : "Person not found"}
              body={
                loadFailed
                  ? LOAD_FAILED_BODY
                  : "They may have been removed, or the link may be old. Everyone you've preserved is on your people page."
              }
              action={
                <Button
                  variant="primary"
                  size="md"
                  onClick={() => (loadFailed ? window.location.reload() : router.push("/people"))}
                >
                  {loadFailed ? "Try again" : "Back to your people"}
                </Button>
              }
            />
          </div>
        )}
      </FadeSwap>
    );
  }

  const persona = (subject.persona ?? { mode: "persona", name: subject.name }) as PersonaConfig;
  // Captured since the first migration and never once shown to the person it
  // was captured about.
  const quality = describeCorpusQuality(subject.corpus_quality_score);
  const archived = isArchived(subject);

  return (
    <FadeSwap swapKey={state} className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 pb-16 pt-8 sm:px-8">
      <motion.div initial="hidden" animate="enter" variants={stagger(0.07)} className="flex flex-col gap-8">
        {/* ── Identity ───────────────────────────────────────────── */}
        <motion.header variants={fadeUp} className="flex flex-col items-start gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-5">
            <PersonAvatar
              id={subject.id}
              seed={`${subject.voice_id ?? subject.id}:${subject.name}`}
              size={64}
              initial={subject.name.trim().charAt(0).toUpperCase()}
              editable
            />
            <div className="flex min-w-0 flex-col gap-1">
              <h1 className="font-serif text-display leading-tight tracking-[-0.02em] text-[var(--color-bone)] sm:text-hero">
                {subject.name}
              </h1>
              <div className="flex flex-wrap items-center gap-2">
                {/* Said plainly at the top, because an archived person is
                    reachable by link and by search — without this, "why isn't
                    she on my people page?" has no answer anywhere. */}
                {isArchived(subject) ? (
                  <span className="inline-flex items-center rounded-full border border-[var(--color-rule-strong)] bg-white/[0.04] px-2.5 py-0.5 text-micro text-[var(--color-bone-dim)]">
                    Archived
                  </span>
                ) : null}
                {subject.relationship ? (
                  <span className="inline-flex items-center rounded-full border border-[var(--color-rule)] bg-white/[0.04] px-2.5 py-0.5 text-micro text-[var(--color-text-secondary)]">
                    {subject.relationship}
                  </span>
                ) : null}
                <span className="text-small text-[var(--color-text-tertiary)]">
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
            <p className="text-body text-[var(--color-bone)]">
              {lastConversation
                ? `Last spoke ${formatRelativeDay(lastConversation.updatedAt)} · ${lastConversation.turns.length} turns`
                : "You haven't spoken yet."}
            </p>
            <p className="text-small text-[var(--color-text-tertiary)]">
              {lastConversation
                ? "Pick up where you left off, or start fresh."
                : `${subject.name} will speak first.`}
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            {/* A reading is a different intention from a conversation — you
                already know what you want said. Given its own door rather than
                buried behind talking. */}
            {subject.voice_id ? (
              <Link
                href={`/people/${subjectId}/reading`}
                className={buttonClasses({ variant: "outline", size: "lg", className: "w-full sm:w-auto" })}
              >
                Have them read something
              </Link>
            ) : null}
            <Button variant="primary" size="lg" onClick={talk} className="w-full sm:w-auto">
              Talk to {subject.name}
            </Button>
          </div>
        </motion.div>

        {/* ── Their voice ────────────────────────────────────────── */}
        {/* Re-cloning has always worked — nothing said so. The first sample is
            usually whatever could be found in the worst week of someone's life,
            and better audio surfaces months later. Without a door here, using
            it meant adding the person a second time and walking away from every
            conversation attached to the first. */}
        <motion.div
          variants={fadeUp}
          className="flex flex-col gap-4 rounded-2xl border border-[var(--color-rule)] bg-white/[0.012] p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6"
        >
          <div className="flex flex-col gap-1">
            <p className="text-body text-[var(--color-bone)]">
              {subject.voice_id ? "Their voice" : "No voice yet"}
            </p>
            <p className="text-small leading-[1.6] text-[var(--color-text-secondary)]">
              {subject.voice_id
                ? "A longer or cleaner recording usually sounds more like them. A new sample replaces this one; nothing else changes."
                : `Bring any recording of ${subject.name} and they can speak.`}
              {quality ? ` Current sample: ${quality.label.toLowerCase()} (${quality.score} out of 100).` : ""}
            </p>
          </div>
          <Link
            href={`/people/${subjectId}/voice`}
            className={buttonClasses({ variant: "outline", size: "md", className: "shrink-0" })}
          >
            {subject.voice_id ? "Record a better sample" : "Add their voice"}
          </Link>
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
                onClick={() => setChosenTab(id)}
                className={`flex-1 cursor-pointer rounded-lg px-3 py-2 text-small transition-colors duration-200 ${
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
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={tab}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
              >
                {tab === "about" ? (
                  editingPersona ? (
                    <PersonaForm
                      key={subject.id}
                      initialName={subject.name}
                      initialRelationship={subject.relationship ?? ""}
                      initialPersona={persona}
                      onSave={async (next) => {
                        await savePersona(next);
                        setEditingPersona(false);
                      }}
                      onCancel={() => setEditingPersona(false)}
                    />
                  ) : (
                    <PersonaReadView
                      subject={subject}
                      persona={persona}
                      onEdit={() => setEditingPersona(true)}
                    />
                  )
                ) : tab === "memories" ? (
                  <MemoryList subjectId={subjectId} personName={subject.name} />
                ) : (
                  <ConversationHistory
                    subjectId={subjectId}
                    voiceId={subject.voice_id}
                    talkHref={talkHref}
                    personName={subject.name}
                  />
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </motion.div>

        {/* ── Archive ────────────────────────────────────────────── */}
        {/* Sits above the delete link and looks nothing like it on purpose.
            The two get confused precisely when someone is upset, and confusing
            them costs a voice that cannot be recovered. This one is a plain
            outline button with a sentence promising nothing is lost; that one
            is red, underlined, and asks you to type their name. */}
        <motion.div
          variants={fadeUp}
          className="flex flex-col gap-3 border-t border-[var(--color-rule)] pt-6 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex flex-col gap-1">
            <p className="text-body text-[var(--color-bone)]">
              {archived ? `${subject.name} is archived` : "Keep them, just not on the shelf"}
            </p>
            <p className="text-small leading-[1.6] text-[var(--color-text-secondary)]">
              {archived
                ? "Hidden from your people page. Everything — their voice, memories, and every conversation — is exactly as you left it."
                : "Hides them from your people page. Nothing is deleted, and you can bring them back whenever you want."}
            </p>
            {archiveError ? (
              <p role="alert" className="text-small text-[var(--color-danger)]">
                {archiveError}
              </p>
            ) : null}
          </div>
          <Button
            variant="outline"
            size="md"
            onClick={() => void toggleArchive()}
            disabled={archiving}
            className="shrink-0"
          >
            {archiving
              ? "Saving…"
              : archived
                ? `Bring ${subject.name} back`
                : `Archive ${subject.name}`}
          </Button>
        </motion.div>

        {/* ── Remove ─────────────────────────────────────────────── */}
        <motion.div variants={fadeUp} className="flex flex-col items-start gap-2">
          {!confirmDelete ? (
            <button
              type="button"
              onClick={() => { setConfirmDelete(true); setDeleteNameInput(""); setDeleteError(null); }}
              className="cursor-pointer text-small text-[var(--color-text-tertiary)] underline underline-offset-4 transition-colors hover:text-[var(--color-danger)]"
            >
              Remove {subject.name} from EternaVoice
            </button>
          ) : (
            <div className="w-full max-w-md rounded-2xl border border-[var(--color-danger)]/20 bg-[var(--color-danger)]/[0.04] p-5">
              <p className="text-body font-medium text-[var(--color-danger)]">
                This permanently deletes their voice, memories, and all conversations.
              </p>
              <p className="mt-2 text-small leading-[1.6] text-[var(--color-text-secondary)]">
                Type <strong className="text-[var(--color-bone)]">{subject.name}</strong> to confirm.
              </p>
              <input
                type="text"
                value={deleteNameInput}
                onChange={(e) => setDeleteNameInput(e.target.value)}
                placeholder={subject.name}
                autoFocus
                className="mt-3 w-full rounded-xl bg-white/[0.025] px-4 py-3 text-body text-[var(--color-bone)] placeholder:text-[var(--color-text-tertiary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-danger)]/40 hairline"
              />
              {deleteError && (
                <p className="mt-2 text-small text-[var(--color-danger)]" role="alert">{deleteError}</p>
              )}
              <div className="mt-4 flex gap-2.5">
                <button
                  type="button"
                  onClick={() => void deletePerson()}
                  disabled={deleting || deleteNameInput.trim() !== subject.name.trim()}
                  className="flex h-11 cursor-pointer items-center rounded-full bg-[var(--color-danger)] px-5 text-small text-[var(--color-ink)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {deleting ? "Removing…" : "Remove permanently"}
                </button>
                <button
                  type="button"
                  onClick={() => { setConfirmDelete(false); setDeleteNameInput(""); }}
                  className="flex h-10 cursor-pointer items-center rounded-full border border-[var(--color-rule-strong)] px-5 text-small text-[var(--color-bone-dim)] transition hover:text-[var(--color-bone)]"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </motion.div>
      </motion.div>
    </FadeSwap>
  );
}

function PersonaReadView({
  subject,
  persona,
  onEdit,
}: {
  subject: SubjectRow;
  persona: PersonaConfig;
  onEdit: () => void;
}) {
  const hasDescription = Boolean(persona.description?.trim());
  const hasCatchphrases = Boolean(persona.catchphrases?.trim());

  return (
    <div className="flex flex-col gap-5">
      {/* Name + relationship */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <span className="text-micro tracking-[0.12em] text-[var(--color-text-tertiary)] uppercase">Name</span>
          <span className="text-body text-[var(--color-bone)]">{subject.name}</span>
        </div>
        {subject.relationship && (
          <div className="flex flex-col gap-1">
            <span className="text-micro tracking-[0.12em] text-[var(--color-text-tertiary)] uppercase">Relationship</span>
            <span className="text-body text-[var(--color-bone)]">{subject.relationship}</span>
          </div>
        )}
      </div>

      {hasDescription && (
        <div className="flex flex-col gap-1.5">
          <span className="text-micro tracking-[0.12em] text-[var(--color-text-tertiary)] uppercase">Who they were</span>
          <p className="text-body leading-[1.7] text-[var(--color-bone)]/85 whitespace-pre-wrap">
            {persona.description}
          </p>
        </div>
      )}

      {hasCatchphrases && (
        <div className="flex flex-col gap-1.5">
          <span className="text-micro tracking-[0.12em] text-[var(--color-text-tertiary)] uppercase">Things they said</span>
          <p className="text-body leading-[1.7] text-[var(--color-bone)]/85 whitespace-pre-wrap">
            {persona.catchphrases}
          </p>
        </div>
      )}

      {!hasDescription && !hasCatchphrases && (
        <p className="text-body leading-[1.7] text-[var(--color-text-secondary)]">
          No details added yet. Edit to help shape how they speak.
        </p>
      )}

      <div className="border-t border-[var(--color-rule)] pt-4">
        <button
          type="button"
          onClick={onEdit}
          className="flex h-10 cursor-pointer items-center gap-2 rounded-full border border-[var(--color-rule-strong)] px-5 text-small text-[var(--color-bone-dim)] transition hover:border-[var(--color-ember)]/30 hover:text-[var(--color-bone)]"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
          </svg>
          Edit persona
        </button>
      </div>
    </div>
  );
}
