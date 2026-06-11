"use client";

import { motion } from "framer-motion";
import { stagger, fadeUp } from "@/lib/motion";

// Honest product facts, not fabricated social proof. Each is literally true
// of how EternaVoice works — which reads more confident than invented counts.
const FACTS = [
  { value: "90 sec", label: "of audio is all it takes to begin" },
  { value: "AES-256", label: "encryption on every word you speak" },
  { value: "No limit", label: "on conversations, memory, or time" },
];

export function Stats() {
  return (
    <section className="mx-auto w-full max-w-5xl px-6 sm:px-8">
      <motion.div
        initial={false}
        whileInView="enter"
        viewport={{ once: true, amount: 0.5 }}
        variants={stagger(0.1)}
        className="grid grid-cols-1 divide-y divide-[var(--color-rule)] border-t border-b border-[var(--color-rule)] sm:grid-cols-3 sm:divide-x sm:divide-y-0"
      >
        {FACTS.map(({ value, label }) => (
          <motion.div
            key={value}
            variants={fadeUp}
            className="flex flex-col items-center gap-2 px-6 py-7 text-center sm:gap-2.5 sm:py-12"
          >
            <span className="font-serif text-[34px] leading-none tracking-[-0.03em] text-[var(--color-bone)] sm:text-[42px]">
              {value}
            </span>
            <span className="max-w-[180px] text-[12px] leading-[1.5] text-[var(--color-bone-dim)]/65">
              {label}
            </span>
          </motion.div>
        ))}
      </motion.div>
    </section>
  );
}
