"use client";

import { useState, useEffect, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { VoicePrint } from "./VoicePrint";
import { useSession } from "@/lib/session";
import { fadeUp, stagger } from "@/lib/motion";
import { formatRelativeDay } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import type { SubjectRow } from "@/lib/db/subjects";
import type { PersonaConfig } from "@/lib/types";

// A presence product is allowed warmth that chrome products aren't.
function greetingForNow(): string {
  const h = new Date().getHours();
  if (h < 5) return "Still up";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

const subscribeNoop = () => () => {};

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
  // Greeting depends on the user's clock — swap in after hydration so the
  // server render never mismatches.
  const mounted = useSyncExternalStore(subscribeNoop, () => true, () => false);

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
          eyebrow={mounted ? greetingForNow() : "Your people"}
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
                  <div className="flex flex-col items-center gap-3">
                    <Button variant="primary" size="md" onClick={() => router.push("/people/new")}>
                      Preserve a voice
                    </Button>
                    <Link
                      href="/demo"
                      className="text-[13px] text-[var(--color-text-secondary)] underline underline-offset-4 transition hover:text-[var(--color-bone)]"
                    >
                      See how a conversation works first
                    </Link>
                  </div>
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
  const href = person.subjectId ? `/people/${person.subjectId}` : null;

  return (
    <motion.article
      variants={fadeUp}
      className={`group relative flex flex-col gap-6 rounded-2xl border border-[var(--color-rule)] bg-white/[0.018] p-6 transition-all duration-300 hover:border-[var(--color-rule-strong)] hover:bg-white/[0.03] ${href ? "cursor-pointer" : ""}`}
    >
      {/* Stretched link: the whole card opens the hub, and it's a real link —
          focusable, Enter works, middle-click works. Buttons sit above it. */}
      {href ? (
        <Link
          href={href}
          aria-label={`Open ${person.name}'s page`}
          className="absolute inset-0 z-0 rounded-2xl"
        />
      ) : null}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          {/* Their voiceprint — a signature unique to this person */}
          <VoicePrint
            seed={`${person.voiceId}:${person.name}`}
            size={56}
            initial={person.name.trim().charAt(0).toUpperCase() || "·"}
          />
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
          <span className="flex shrink-0 items-center gap-1.5 text-[11px] text-[var(--color-verdigris)]">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--color-verdigris)]" aria-hidden />
            Active
          </span>
        ) : null}
      </div>

      <div className="relative z-10 mt-auto flex items-center justify-between gap-3">
        <Button variant="primary" size="md" onClick={onTalk}>
          Talk
        </Button>
        <p className="text-[12px] text-[var(--color-text-tertiary)]">
          {lastSpoke ? `Last spoke ${lastSpoke}` : `Added ${new Date(person.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`}
        </p>
      </div>
    </motion.article>
  );
}
