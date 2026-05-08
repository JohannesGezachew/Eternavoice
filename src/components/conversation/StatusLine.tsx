"use client";

import { AnimatePresence, motion } from "framer-motion";
import type { ConversationStatus } from "@/lib/types";

const COPY: Record<ConversationStatus, { word: string; hint: string }> = {
  idle: { word: "Listening", hint: "Press and hold the microphone to speak." },
  transcribing: { word: "Hearing you", hint: "" },
  thinking: { word: "Thinking", hint: "" },
  speaking: { word: "Speaking", hint: "" },
};

export function StatusLine({ status }: { status: ConversationStatus }) {
  const copy = COPY[status];
  return (
    <div className="flex items-center justify-center gap-3 text-[12px] tracking-[0.2em] uppercase">
      <span
        className={`inline-flex h-1.5 w-1.5 rounded-full transition-colors duration-500 ${
          status === "idle"
            ? "bg-[var(--color-bone-dim)]/60"
            : "bg-[var(--color-ember)]"
        }`}
      />
      <AnimatePresence mode="popLayout">
        <motion.span
          key={status}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          className="text-[var(--color-bone)]/85"
        >
          {copy.word}
        </motion.span>
      </AnimatePresence>
      {copy.hint ? (
        <span className="hidden text-[var(--color-bone-dim)] tracking-normal normal-case sm:inline">
          · {copy.hint}
        </span>
      ) : null}
    </div>
  );
}
