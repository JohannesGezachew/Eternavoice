"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useSession } from "@/lib/session";
import { ConversationExperience } from "@/components/conversation/ConversationExperience";
import type { SubjectRow } from "@/lib/db/subjects";
import type { PersonaConfig } from "@/lib/types";

/**
 * Resolves a /people/[id]/talk URL to an active session voice before
 * rendering the conversation. `id` is a subject id, or the literal
 * "current" for whatever voice is already active (legacy local voices).
 */
export function TalkGate({ subjectId }: { subjectId: string }) {
  const router = useRouter();
  const voiceId = useSession((s) => s.voiceId);
  const activeSubjectId = useSession((s) => s.activeSubjectId);
  const setActiveVoice = useSession((s) => s.setActiveVoice);
  const setVoice = useSession((s) => s.setVoice);
  const setPersona = useSession((s) => s.setPersona);

  const fetchingRef = useRef(false);

  // Readiness is derived: the gate opens once the requested person is the
  // active session voice. The effect below only performs the activation.
  const ready =
    subjectId === "current"
      ? Boolean(voiceId)
      : Boolean(voiceId) && activeSubjectId === subjectId;

  useEffect(() => {
    if (ready) return;

    // Read the live store, not the render closure: during React hydration the
    // first snapshot is the initial (server) state, so closure values lag one
    // render behind the persisted localStorage session. Acting on the stale
    // closure would bounce returning users to /people/new on a hard load.
    const live = useSession.getState();

    if (subjectId === "current") {
      if (live.voiceId) return; // hydration lag — next render opens the gate
      router.replace("/people/new");
      return;
    }

    // Already active in the live store (hydration lag): activating again
    // would wipe the persisted in-progress turns via setActiveVoice.
    if (live.voiceId && live.activeSubjectId === subjectId) return;

    const match = live.voices.find((v) => v.subjectId === subjectId);
    if (match) {
      setActiveVoice(match.id, subjectId);
      return;
    }

    // Not in the local store (fresh device / cleared storage) — resolve
    // the person from the database once.
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    fetch("/api/user/data")
      .then((r) => r.json())
      .then((d: { subjects?: SubjectRow[] }) => {
        const subject = d.subjects?.find((s) => s.id === subjectId);
        if (subject?.voice_id) {
          setVoice(subject.voice_id, subject.name, subject.id);
          const persona = subject.persona as PersonaConfig | null;
          if (persona?.name) setPersona(persona);
        } else {
          router.replace("/people");
        }
      })
      .catch(() => router.replace("/people"));
  }, [ready, subjectId, setActiveVoice, setVoice, setPersona, router]);

  if (!ready) {
    return (
      <div className="flex min-h-dvh items-center justify-center" role="status" aria-label="Loading">
        <motion.span
          className="inline-block h-5 w-5 rounded-full border-2 border-[var(--color-bone-dim)]/20 border-t-[var(--color-bone-dim)]"
          animate={{ rotate: 360 }}
          transition={{ duration: 0.9, repeat: Infinity, ease: "linear" }}
        />
      </div>
    );
  }

  return <ConversationExperience backHref={subjectId === "current" ? "/people" : `/people/${subjectId}`} />;
}
