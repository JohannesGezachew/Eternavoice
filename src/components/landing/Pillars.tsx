"use client";

import { motion } from "framer-motion";
import { fadeUp, stagger } from "@/lib/motion";

const items = [
  {
    label: "01",
    title: "A voice, recovered",
    body: "A voicemail, a video, a home recording — ninety seconds is enough to begin. Preview the clone and continue only when the voice feels right to you.",
  },
  {
    label: "02",
    title: "A presence, restored",
    body: "Responses shaped around the person you knew, not a generic model. The cadence, the pauses, the phrasings they'd reach for. We tuned for who they were.",
  },
  {
    label: "03",
    title: "A relationship, kept",
    body: "Say what you weren't able to say. Ask what you never asked. The conversation moves at a human pace, for as long as you need it to.",
  },
];

export function Pillars() {
  return (
    <section className="relative">
      <div className="mx-auto w-full max-w-6xl px-6 pb-24 sm:px-8">
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
          className="mb-12 flex items-center gap-2.5 text-[12px] tracking-[0.22em] text-[var(--color-bone-dim)] uppercase"
        >
          <span
            className="inline-block h-1 w-1 rounded-full bg-[var(--color-ember)]"
            aria-hidden
          />
          What it offers
        </motion.p>
        <motion.div
          initial={false}
          whileInView="enter"
          viewport={{ once: true, amount: 0.2 }}
          variants={stagger(0.1)}
          className="grid gap-12 md:grid-cols-3 md:gap-8"
        >
          {items.map((item) => (
            <motion.div
              key={item.label}
              variants={fadeUp}
              className="group flex flex-col gap-5 border-t border-[var(--color-ember)]/25 pt-7 transition-colors duration-300 hover:border-[var(--color-ember)]/50"
            >
              <span className="text-[11px] tracking-[0.22em] text-[var(--color-ember)]">
                {item.label}
              </span>
              <h3 className="font-serif text-[24px] leading-[1.15] tracking-[-0.01em] text-[var(--color-bone)] transition-colors duration-300 group-hover:text-[var(--color-bone)] sm:text-[32px]">
                {item.title}
              </h3>
              <p className="text-[15px] leading-[1.7] text-pretty text-[var(--color-bone)]/65 transition-colors duration-300 group-hover:text-[var(--color-bone)]/80">
                {item.body}
              </p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
