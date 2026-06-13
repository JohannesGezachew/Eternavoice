"use client";

import { useState, useEffect, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { PersonAvatar } from "./PersonAvatar";
import { useSession } from "@/lib/session";
import { fadeUp, stagger } from "@/lib/motion";
import { formatRelativeDay } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import type { SubjectRow } from "@/lib/db/subjects";
import type { PersonaConfig } from "@/lib/types";

function greetingForNow(): string {
  const h = new Date().getHours();
  if (h < 5) return "Still up";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

const subscribeNoop = () => () => {};

type SortKey = "recent" | "alpha" | "added";

interface PersonItem {
  voiceId: string;
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
  const memories = useSession((s) => s.memories);

  const [subjects, setSubjects] = useState<SubjectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAuthed, setIsAuthed] = useState(false);
  const [sort, setSort] = useState<SortKey>("recent");
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

  const dbPeople = subjects.filter((s) => s.voice_id);
  const basePeople: PersonItem[] = isAuthed && dbPeople.length
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

  const lastConvAt = (person: PersonItem): number | null => {
    const conv = conversations.find(
      (c) =>
        (person.subjectId && c.subjectId === person.subjectId) ||
        c.voiceId === person.voiceId,
    );
    return conv ? conv.updatedAt : null;
  };

  const people = [...basePeople].sort((a, b) => {
    if (sort === "alpha") return a.name.localeCompare(b.name);
    if (sort === "added") return b.createdAt - a.createdAt;
    // "recent": most recently spoken first; never-spoken go to bottom by createdAt
    const aAt = lastConvAt(a) ?? 0;
    const bAt = lastConvAt(b) ?? 0;
    return bAt - aAt;
  });

  const convCount = (person: PersonItem): number =>
    conversations.filter(
      (c) =>
        (person.subjectId && c.subjectId === person.subjectId) ||
        c.voiceId === person.voiceId,
    ).length;

  const memCount = (person: PersonItem): number =>
    memories.filter(
      (m) => person.subjectId && m.subjectId === person.subjectId,
    ).length;

  const lastSpokeLabel = (person: PersonItem): string | null => {
    const at = lastConvAt(person);
    return at ? formatRelativeDay(at) : null;
  };

  const lastConvTitle = (person: PersonItem): string | null => {
    const conv = conversations
      .filter(
        (c) =>
          (person.subjectId && c.subjectId === person.subjectId) ||
          c.voiceId === person.voiceId,
      )
      .sort((a, b) => b.updatedAt - a.updatedAt)[0];
    return conv?.title ?? null;
  };

  const talk = (person: PersonItem) => {
    setActiveVoice(person.voiceId, person.subjectId ?? undefined);
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

        {/* Sort controls — only shown once there's more than one person */}
        {people.length > 1 && (
          <div className="flex items-center gap-1 -mt-6">
            {(
              [
                { key: "recent" as SortKey, label: "Recently spoken" },
                { key: "alpha" as SortKey, label: "A–Z" },
                { key: "added" as SortKey, label: "Recently added" },
              ] as const
            ).map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => setSort(key)}
                className={`cursor-pointer rounded-full px-3.5 py-1.5 text-[12px] transition-colors duration-150 ${
                  sort === key
                    ? "bg-white/[0.07] text-[var(--color-bone)]"
                    : "text-[var(--color-bone-dim)] hover:text-[var(--color-bone)]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}

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
                  lastSpoke={lastSpokeLabel(person)}
                  lastConversationTitle={lastConvTitle(person)}
                  conversationCount={convCount(person)}
                  memoryCount={memCount(person)}
                  onTalk={() => talk(person)}
                />
              ))}
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
                variant="people"
                title="No one here yet"
                body="Start with any recording of their voice — a voicemail, a video, a voice note — and you'll be talking in a few minutes."
                action={
                  <div className="flex flex-col items-center gap-3">
                    <Button variant="primary" size="md" onClick={() => router.push("/people/new")}>
                      Begin with someone
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
  lastConversationTitle,
  conversationCount,
  memoryCount,
  onTalk,
}: {
  person: PersonItem;
  active: boolean;
  lastSpoke: string | null;
  lastConversationTitle: string | null;
  conversationCount: number;
  memoryCount: number;
  onTalk: () => void;
}) {
  const href = person.subjectId ? `/people/${person.subjectId}` : null;

  return (
    <motion.article
      variants={fadeUp}
      className={`group relative flex flex-col gap-6 rounded-2xl border border-[var(--color-rule)] bg-white/[0.018] p-6 transition-all duration-300 hover:-translate-y-0.5 hover:border-[var(--color-rule-strong)] hover:bg-white/[0.03] hover:shadow-lg ${href ? "cursor-pointer" : ""}`}
    >
      {href ? (
        <Link
          href={href}
          aria-label={`Open ${person.name}'s page`}
          className="absolute inset-0 z-0 rounded-2xl"
        />
      ) : null}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <PersonAvatar
            id={person.subjectId ?? person.voiceId}
            seed={`${person.voiceId}:${person.name}`}
            size={56}
            initial={person.name.trim().charAt(0).toUpperCase() || "·"}
          />
          <div className="flex min-w-0 flex-col gap-1">
            <h2 className="truncate font-serif text-[24px] leading-tight text-[var(--color-bone)]">
              {person.name}
            </h2>
            <div className="flex flex-wrap items-center gap-1.5">
              {person.relationship ? (
                <span className="inline-flex items-center rounded-full border border-[var(--color-rule)] bg-white/[0.04] px-2.5 py-0.5 text-[11px] text-[var(--color-text-secondary)]">
                  {person.relationship}
                </span>
              ) : null}
              {conversationCount > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-white/[0.04] px-2.5 py-0.5 text-[11px] text-[var(--color-text-tertiary)]">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                  {conversationCount}
                </span>
              )}
              {memoryCount > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-white/[0.04] px-2.5 py-0.5 text-[11px] text-[var(--color-text-tertiary)]">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 21 12 17.77 5.82 21 7 14.14 2 9.27l6.91-1.01L12 2z" />
                  </svg>
                  {memoryCount}
                </span>
              )}
            </div>
          </div>
        </div>
        {active ? (
          <span className="flex shrink-0 items-center gap-1.5 text-[11px] text-[var(--color-verdigris)]">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--color-verdigris)]" aria-hidden />
            Active
          </span>
        ) : null}
      </div>

      {lastConversationTitle && (
        <p className="line-clamp-1 text-[12px] italic text-[var(--color-text-tertiary)]">
          &ldquo;{lastConversationTitle}&rdquo;
        </p>
      )}

      <div className="relative z-10 mt-auto flex items-center justify-between gap-3">
        <Button variant="primary" size="md" onClick={onTalk}>
          Talk
        </Button>
        <p className="text-[12px] text-[var(--color-text-tertiary)]">
          {lastSpoke
            ? `Last spoke ${lastSpoke}`
            : `Added ${new Date(person.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`}
        </p>
      </div>
    </motion.article>
  );
}
