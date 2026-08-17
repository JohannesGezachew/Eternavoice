"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import type { ChatTurn } from "@/lib/types";

export type RememberOutcome = "saved" | "known" | "failed";

interface RememberMarkProps {
  /** The last thing the person said — the only turn this ever acts on. */
  turn: ChatTurn | null;
  personName: string;
  onRemember: (turn: ChatTurn) => Promise<RememberOutcome>;
  onUndo: () => void | Promise<void>;
}

type Phase = "idle" | "saving" | "kept" | "known" | "failed";

/** How long the confirmation (and its undo) stays before settling back. */
const SETTLE_MS = 8000;

/**
 * "Keep this" for the last thing the person said.
 *
 * Deliberately quiet. It sits beside the composer rather than in the
 * transcript, because the transcript is hidden by default and gone entirely in
 * ambient mode — which is exactly where the conversations worth keeping happen.
 * At rest it is a mark, not a call to action; it only speaks up once it has
 * something to confirm.
 */
export function RememberMark({ turn, personName, onRemember, onUndo }: RememberMarkProps) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [keptTurnId, setKeptTurnId] = useState<string | null>(null);
  const [offeredTurnId, setOfferedTurnId] = useState<string | null>(turn?.id ?? null);
  const settleRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // A new turn is a new offer — drop whatever the last one was showing.
  // Adjusted during render rather than in an effect, so the stale confirmation
  // never paints for a frame against the wrong turn.
  const turnId = turn?.id ?? null;
  if (turnId !== offeredTurnId) {
    setOfferedTurnId(turnId);
    setPhase("idle");
  }

  useEffect(() => {
    return () => {
      if (settleRef.current) clearTimeout(settleRef.current);
    };
  }, []);

  const settleSoon = () => {
    if (settleRef.current) clearTimeout(settleRef.current);
    settleRef.current = setTimeout(() => setPhase("idle"), SETTLE_MS);
  };

  // Hold the row even with nothing to offer, so the composer never shifts
  // under the user between a keepable turn and a bare "mm".
  if (!turn) return <div className="min-h-[2.75rem]" aria-hidden />;

  const alreadyKept = keptTurnId === turn.id && phase === "idle";

  const save = async () => {
    if (phase === "saving") return;
    setPhase("saving");
    const outcome = await onRemember(turn);
    if (outcome === "failed") {
      setPhase("failed");
      settleSoon();
      return;
    }
    setKeptTurnId(turn.id);
    setPhase(outcome === "known" ? "known" : "kept");
    settleSoon();
  };

  const undo = async () => {
    if (settleRef.current) clearTimeout(settleRef.current);
    setKeptTurnId(null);
    setPhase("idle");
    await onUndo();
  };

  return (
    <div className="flex min-h-[2.75rem] items-center justify-center">
      <AnimatePresence mode="wait" initial={false}>
        {phase === "kept" || phase === "known" ? (
          <motion.div
            key="kept"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="flex items-center gap-3"
            role="status"
          >
            <span className="flex items-center gap-2 text-small text-[var(--color-bone)]/85">
              <BookmarkIcon filled />
              {phase === "known"
                ? `${personName} already carries that.`
                : `${personName} will carry that.`}
            </span>
            <button
              type="button"
              onClick={() => void undo()}
              className="flex h-11 cursor-pointer items-center rounded-full px-2 text-small text-[var(--color-bone-dim)] underline underline-offset-4 transition hover:text-[var(--color-bone)]"
            >
              Undo
            </button>
          </motion.div>
        ) : phase === "failed" ? (
          /* A button, because it says to tap it. This was a paragraph: the
             user followed the instruction, nothing happened, and eight seconds
             later the message vanished along with the memory they wanted their
             dead parent to carry. */
          <motion.button
            key="failed"
            type="button"
            onClick={() => void save()}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35 }}
            className="flex h-11 cursor-pointer items-center rounded-full px-3 text-small text-[var(--color-danger)] underline underline-offset-4 transition hover:opacity-80"
          >
            That didn&rsquo;t save. Tap to try again.
          </motion.button>
        ) : (
          <motion.button
            key="mark"
            type="button"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35 }}
            onClick={() => void save()}
            disabled={phase === "saving" || alreadyKept}
            aria-label={
              alreadyKept
                ? `Already kept for ${personName}`
                : `Have ${personName} remember what you just said`
            }
            className={cn(
              "group flex h-11 cursor-pointer items-center gap-2 rounded-full px-3 text-small transition-colors duration-300",
              alreadyKept
                ? "cursor-default text-[var(--color-ember)]/70"
                : "text-[var(--color-text-tertiary)] hover:text-[var(--color-bone)]",
              phase === "saving" && "animate-pulse",
            )}
          >
            <BookmarkIcon filled={alreadyKept} />
            {/* The label stays out of the room until someone reaches for it. */}
            <span
              className={cn(
                "hidden transition-opacity duration-300 sm:inline",
                alreadyKept
                  ? "opacity-100"
                  : "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100",
              )}
            >
              {alreadyKept ? "Kept" : "Remember that"}
            </span>
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}

function BookmarkIcon({ filled }: { filled?: boolean }) {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M7 4h10a1 1 0 0 1 1 1v15l-6-4-6 4V5a1 1 0 0 1 1-1z" />
    </svg>
  );
}
