"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { RecordExperience, type CloneResult } from "@/components/recording/RecordExperience";
import { ListenStep } from "./NewPersonWizard";
import { EmptyState } from "@/components/ui/EmptyState";
import { LOAD_FAILED_TITLE, LOAD_FAILED_BODY } from "@/lib/loadState";
import { Button } from "@/components/ui/Button";
import { useSession } from "@/lib/session";
import { fadeUp, stagger } from "@/lib/motion";
import { trackEvent } from "@/lib/analytics";
import { describeCorpusQuality } from "@/lib/peopleView";
import type { SubjectRow } from "@/lib/db/subjects";

/**
 * Give someone a better voice.
 *
 * The first sample is whatever recording could be found under pressure, often
 * in the first week of a death. Better audio turns up later — a birthday video,
 * an old voicemail someone else still had — and until this screen existed the
 * only way to use it was to add the person a second time and abandon the
 * conversations attached to the first.
 *
 * The new sample replaces the voice on the person who is already here: same
 * page, same memories, same history.
 */
export function ReRecordVoice({ subjectId }: { subjectId: string }) {
  const router = useRouter();
  const setVoice = useSession((s) => s.setVoice);

  const [subject, setSubject] = useState<SubjectRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [clone, setClone] = useState<CloneResult | null>(null);

  useEffect(() => {
    fetch("/api/user/data")
      .then((r) => r.json())
      .then((d: { subjects?: SubjectRow[] }) => {
        setSubject(d.subjects?.find((s) => s.id === subjectId) ?? null);
      })
      .catch(() => setLoadFailed(true))
      .finally(() => setLoading(false));
  }, [subjectId]);

  const handleCloned = useCallback(
    (result: CloneResult) => {
      setClone(result);
      // The store still points at the voice this one replaces; leaving it there
      // would have the next conversation speak in the old sample.
      setVoice(result.voiceId, subject?.name ?? result.name, result.subjectId ?? subjectId);
      trackEvent("voice_recloned");
    },
    [setVoice, subject?.name, subjectId],
  );

  if (loading) {
    return (
      <div
        className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-6 pb-16 pt-8 sm:px-8"
        role="status"
        aria-label="Loading"
      >
        <div className="h-10 w-64 animate-pulse rounded-lg bg-white/[0.04]" />
        <div className="h-64 animate-pulse rounded-2xl bg-white/[0.025]" />
      </div>
    );
  }

  if (!subject) {
    return (
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
    );
  }

  const quality = describeCorpusQuality(subject.corpus_quality_score);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-6 pb-16 pt-6 sm:px-8">
      <motion.div initial="hidden" animate="enter" variants={stagger(0.07)} className="flex flex-1 flex-col gap-6">
        {clone ? (
          <motion.div variants={fadeUp} className="flex flex-1 items-start justify-center pt-2 sm:items-center sm:pt-0">
            <ListenStep
              name={subject.name}
              voiceId={clone.voiceId}
              subjectId={clone.subjectId ?? subject.id}
              acceptLabel="Keep this voice"
              onAccept={() => router.push(`/people/${subject.id}`)}
              onRetry={() => setClone(null)}
            />
          </motion.div>
        ) : (
          <>
            <motion.div variants={fadeUp} className="flex max-w-2xl flex-col gap-3">
              <h1 className="font-serif text-display leading-[1.08] tracking-[-0.02em] text-balance text-[var(--color-bone)] sm:text-hero">
                A better recording of {subject.name}.
              </h1>
              <p className="text-body leading-[1.7] text-[var(--color-text-secondary)]">
                A longer or cleaner sample usually sounds more like them. This
                replaces the voice on {subject.name}&rsquo;s page — every
                conversation and memory stays exactly where it is.
              </p>
              {quality ? (
                <p className="text-small text-[var(--color-text-tertiary)]">
                  Current sample: {quality.label.toLowerCase()} ({quality.score} out of 100).
                </p>
              ) : null}
            </motion.div>
            <motion.div variants={fadeUp} className="flex flex-1 flex-col">
              <RecordExperience
                subjectName={subject.name}
                subjectId={subject.id}
                onCloned={handleCloned}
              />
            </motion.div>
          </>
        )}
      </motion.div>
    </div>
  );
}
