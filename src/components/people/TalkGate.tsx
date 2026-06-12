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
      // No voice at all: the people page (with its empty state) is the right
      // landing, not the creation wizard.
      router.replace("/people");
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
    // Loading IS the brand moment here: the orb breathing in the same spot
    // the live one will occupy, instead of a generic spinner.
    return (
      <div className="flex min-h-dvh items-center justify-center" role="status" aria-label="Loading">
        <div className="relative h-44 w-44" aria-hidden>
          <motion.div
            className="absolute inset-[-30%] rounded-full blur-[50px]"
            style={{ background: "radial-gradient(closest-side, var(--orb-glow-lo), transparent 75%)" }}
            animate={{ scale: [1, 1.06, 1], opacity: [0.6, 0.9, 0.6] }}
            transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
          />
          <div className="absolute inset-[10%] rounded-full border border-[var(--color-rule-strong)]" />
          <motion.div
            className="absolute inset-[24%] rounded-full"
            style={{
              background: "radial-gradient(closest-side, var(--orb-core-mid), var(--orb-core-lo) 50%, transparent 85%)",
              mixBlendMode: "var(--orb-blend)" as never,
            }}
            animate={{ scale: [1, 1.05, 1], opacity: [0.7, 0.95, 0.7] }}
            transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut", delay: 0.4 }}
          />
        </div>
      </div>
    );
  }

  return <ConversationExperience backHref={subjectId === "current" ? "/people" : `/people/${subjectId}`} />;
}
