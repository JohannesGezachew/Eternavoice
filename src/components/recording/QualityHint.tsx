"use client";

import { motion, AnimatePresence } from "framer-motion";
import type { QualityVerdict } from "@/lib/audio/quality";
import { qualityCopy } from "@/lib/audio/quality";

const dotTone: Record<"warming" | "ok" | "warn", string> = {
  warming: "bg-[var(--color-bone-dim)]/60",
  ok: "bg-[var(--color-ember)]",
  warn: "bg-[var(--color-bone-2)]/80",
};

export function QualityHint({ verdict }: { verdict: QualityVerdict }) {
  const copy = qualityCopy(verdict);
  return (
    <AnimatePresence mode="popLayout">
      <motion.div
        key={verdict}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        className="flex items-center gap-3 text-[13px]"
      >
        <span
          className={`relative inline-flex h-1.5 w-1.5 rounded-full ${dotTone[copy.tone]}`}
        >
          {copy.tone === "ok" ? (
            <span className="absolute inset-[-4px] animate-[pulse_2.6s_ease-in-out_infinite] rounded-full bg-[var(--color-ember)]/30" />
          ) : null}
        </span>
        <span className="text-[var(--color-bone)]/85">{copy.title}</span>
        <span className="text-[var(--color-bone-dim)]">{copy.hint}</span>
      </motion.div>
    </AnimatePresence>
  );
}
