"use client";

import { motion } from "framer-motion";
import { fadeUp, stagger } from "@/lib/motion";

const items = [
  {
    label: "01",
    title: "Hear them speak",
    body: "Upload 90 seconds of any recording — a voicemail, a video, a home clip. Preview their voice and continue only when it sounds right.",
  },
  {
    label: "02",
    title: "Responds as them",
    body: "The persona reflects how they actually spoke: their cadence, phrasings, the way they answered questions. Not a generic AI — shaped around who they were.",
  },
  {
    label: "03",
    title: "Say what you never got to",
    body: "No time limit, no appointment. Start whenever you need it. Memory carries forward — each session picks up where the last left off.",
  },
];

export function Pillars() {
  return (
    <section className="relative">
      <div className="mx-auto w-full max-w-6xl px-6 pt-14 pb-16 sm:px-8 sm:pt-28 sm:pb-28">
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
          className="eyebrow mb-16"
        >
          Why people use EternaVoice
        </motion.p>

        <motion.div
          initial={false}
          whileInView="enter"
          viewport={{ once: true, amount: 0.15 }}
          variants={stagger(0.12)}
          className="flex flex-col"
        >
          {items.map((item) => (
            <motion.div
              key={item.label}
              variants={fadeUp}
              className="group grid grid-cols-[2.75rem_1fr] gap-x-5 border-t border-[var(--color-rule)] pt-7 pb-10 transition-colors duration-500 sm:grid-cols-[6rem_1fr] sm:gap-x-12 sm:pt-8 sm:pb-12"
            >
              {/* Large dim number — spans both rows */}
              <span
                className="row-span-2 select-none self-start font-serif text-[40px] leading-[0.85] tracking-[-0.04em] text-[var(--color-bone)]/[0.07] transition-colors duration-500 group-hover:text-[var(--color-bone)]/[0.13] sm:text-[80px]"
                aria-hidden
              >
                {item.label}
              </span>

              {/* Title */}
              <h3 className="self-end font-serif text-[22px] leading-[1.1] tracking-[-0.01em] text-[var(--color-bone)] sm:text-[28px]">
                {item.title}
              </h3>

              {/* Body */}
              <p className="mt-3 max-w-xl text-[15px] leading-[1.75] text-pretty text-[var(--color-bone)]/55 transition-colors duration-500 group-hover:text-[var(--color-bone)]/70">
                {item.body}
              </p>
            </motion.div>
          ))}

          {/* Closing rule */}
          <div className="border-t border-[var(--color-rule)]" aria-hidden />
        </motion.div>
      </div>
    </section>
  );
}
