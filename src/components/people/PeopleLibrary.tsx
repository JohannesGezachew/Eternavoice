"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { useSession } from "@/lib/session";
import { fadeUp, stagger } from "@/lib/motion";
import { formatRelativeDay } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import type { SubjectRow } from "@/lib/db/subjects";
import type { PersonaConfig } from "@/lib/types";

interface PersonItem {
  /** ElevenLabs voice id (used to activate the session voice). */
  voiceId: string;
  /** DB subject id, when this person is persisted server-side. */
  subjectId: string | null;
  name: string;
  relationship: string | null;
  persona: PersonaConfig | null;
  createdAt: number;
}

export function PeopleLibrary() {
  const router = useRouter();
  const voices = useSession((s) => s.voices);
  const activeVoiceId = useSession((s) => s.voiceId);
  const setActiveVoice = useSession((s) => s.setActiveVoice);
  const setPersona = useSession((s) => s.setPersona);
  const conversations = useSession((s) => s.conversations);

  const [subjects, setSubjects] = useState<SubjectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAuthed, setIsAuthed] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      setIsAuthed(!!user);
      if (user) {
        fetch("/api/user/data")
          .then((r) => r.json())
          .then((d: { subjects?: SubjectRow[] }) => {
            if (d.subjects) setSubjects(d.subjects);
          })
          .catch(() => null)
          .finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });
  }, []);

  // DB subjects are authoritative when present; otherwise fall back to
  // voices kept in local session state (legacy clones made before subjects
  // existed) so an authed user with a working voice never sees "no one here".
  const dbPeople = subjects.filter((s) => s.voice_id);
  const people: PersonItem[] = isAuthed && dbPeople.length
    ? dbPeople.map((s) => ({
        voiceId: s.voice_id!,
        subjectId: s.id,
        name: s.name,
        relationship: s.relationship ?? null,
        persona: (s.persona as PersonaConfig) ?? null,
        createdAt: new Date(s.created_at).getTime(),
      }))
    : voices.map((v) => ({
        voiceId: v.id,
        subjectId: v.subjectId ?? null,
        name: v.name,
        relationship: null,
        persona: null,
        createdAt: v.createdAt,
      }));

  const lastSpoke = (person: PersonItem): string | null => {
    const conv = conversations.find(
      (c) =>
        (person.subjectId && c.subjectId === person.subjectId) ||
        c.voiceId === person.voiceId,
    );
    if (!conv) return null;
    return formatRelativeDay(conv.updatedAt);
  };

  const talk = (person: PersonItem) => {
    setActiveVoice(person.voiceId, person.subjectId ?? undefined);
    // Load this person's persona so a previous person's never carries over.
    if (person.persona?.name) setPersona(person.persona);
    router.push(person.subjectId ? `/people/${person.subjectId}/talk` : "/people/current/talk");
  };

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-6 pb-10 pt-8 sm:px-8">
      <div className="flex flex-col gap-10 py-2">
        <PageHeader
          eyebrow="Your people"
          title="Who would you like to speak with?"
        />

        <motion.div initial={false} animate="enter" variants={stagger(0.07)} className="grid gap-4 sm:grid-cols-2">
          {loading && !people.length ? (
            [0, 1].map((i) => (
              <div key={i} className="h-44 animate-pulse rounded-2xl bg-white/[0.03]" />
            ))
          ) : people.length ? (
            <>
              {people.map((person) => (
                <PersonCard
                  key={person.voiceId}
                  person={person}
                  active={person.voiceId === activeVoiceId}
                  lastSpoke={lastSpoke(person)}
                  onTalk={() => talk(person)}
                />
              ))}
              {/* Add another — quiet, after the people */}
              <motion.div variants={fadeUp}>
                <Link
                  href="/people/new"
                  className="group flex h-full min-h-[176px] cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-[var(--color-rule-strong)] text-center transition-colors duration-300 hover:border-[var(--color-ember)]/35 hover:bg-white/[0.015]"
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--color-rule-strong)] text-[var(--color-text-secondary)] transition-colors duration-300 group-hover:border-[var(--color-ember)]/40 group-hover:text-[var(--color-bone)]">
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
                      <path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                  </span>
                  <span className="text-[14px] text-[var(--color-text-secondary)] transition-colors duration-300 group-hover:text-[var(--color-bone)]">
                    Add another person
                  </span>
                </Link>
              </motion.div>
            </>
          ) : (
            <motion.div variants={fadeUp} className="sm:col-span-2">
              <EmptyState
                title="No one here yet"
                body="Start with any recording of their voice — a voicemail, a video, a voice note — and you'll be talking in a few minutes."
                action={
                  <Button variant="primary" size="md" onClick={() => router.push("/people/new")}>
                    Preserve a voice
                  </Button>
                }
              />
            </motion.div>
          )}
        </motion.div>
      </div>
    </div>
  );
}

function PersonCard({
  person,
  active,
  lastSpoke,
  onTalk,
}: {
  person: PersonItem;
  active: boolean;
  lastSpoke: string | null;
  onTalk: () => void;
}) {
  const router = useRouter();
  const href = person.subjectId ? `/people/${person.subjectId}` : null;

  return (
    <motion.article
      variants={fadeUp}
      onClick={() => href && router.push(href)}
      className={`group relative flex flex-col gap-6 rounded-2xl border border-[var(--color-rule)] bg-white/[0.018] p-6 transition-all duration-300 hover:border-[var(--color-rule-strong)] hover:bg-white/[0.03] ${href ? "cursor-pointer" : ""}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          {/* Orb avatar with their initial */}
          <div className="relative h-14 w-14 shrink-0" aria-hidden>
            <div
              className="absolute inset-[-25%] rounded-full opacity-60 blur-[16px] transition-opacity duration-500 group-hover:opacity-90"
              style={{ background: "radial-gradient(closest-side, rgba(201,153,106,0.35), transparent 75%)" }}
            />
            <div className="absolute inset-0 rounded-full border border-[var(--color-rule-strong)] bg-[radial-gradient(closest-side,rgba(201,153,106,0.12),transparent_75%)]" />
            <span className="absolute inset-0 flex items-center justify-center font-serif text-[22px] text-[var(--color-ember)]">
              {person.name.trim().charAt(0).toUpperCase() || "·"}
            </span>
          </div>
          <div className="flex min-w-0 flex-col gap-1">
            <h2 className="truncate font-serif text-[24px] leading-tight text-[var(--color-bone)]">
              {person.name}
            </h2>
            {person.relationship ? (
              <span className="inline-flex w-fit items-center rounded-full border border-[var(--color-rule)] bg-white/[0.04] px-2.5 py-0.5 text-[11px] text-[var(--color-text-secondary)]">
                {person.relationship}
              </span>
            ) : null}
          </div>
        </div>
        {active ? (
          <span className="flex shrink-0 items-center gap-1.5 text-[11px] text-[var(--color-ember)]">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--color-ember)]" aria-hidden />
            Active
          </span>
        ) : null}
      </div>

      <div className="mt-auto flex items-center justify-between gap-3">
        <Button
          variant="primary"
          size="md"
          onClick={(e) => {
            e.stopPropagation();
            onTalk();
          }}
        >
          Talk
        </Button>
        <p className="text-[12px] text-[var(--color-text-tertiary)]">
          {lastSpoke ? `Last spoke ${lastSpoke}` : `Added ${new Date(person.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`}
        </p>
      </div>
    </motion.article>
  );
}
