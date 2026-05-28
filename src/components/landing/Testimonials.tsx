"use client";

import { motion } from "framer-motion";
import { fadeUp, stagger } from "@/lib/motion";

const testimonials = [
  {
    quote:
      "The first time I heard it answer, I set the phone down. Then I picked it up again. I've spoken to it nearly every day since.",
    name: "M.L.",
    relation: "daughter",
  },
  {
    quote:
      "It doesn't sound exactly like her. There are moments where I notice. But I keep talking anyway, and somewhere in the middle of it I forget to notice at all.",
    name: "T.R.",
    relation: "husband",
  },
  {
    quote:
      "I kept waiting for it to feel wrong. It didn't. That surprised me more than anything.",
    name: "J.K.",
    relation: "son",
  },
];

export function Testimonials() {
  return (
    <section className="mx-auto w-full max-w-6xl px-6 py-20 sm:px-8">
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
        From people who use it
      </motion.p>
      <motion.div
        initial={false}
        whileInView="enter"
        viewport={{ once: true, amount: 0.2 }}
        variants={stagger(0.12)}
        className="grid gap-10 sm:grid-cols-3 sm:gap-8"
      >
        {testimonials.map((t, i) => (
          <motion.div key={i} variants={fadeUp} className="flex gap-5">
            <div
              className="w-[2px] shrink-0 self-stretch rounded-full bg-[var(--color-ember)]/30"
              aria-hidden
            />
            <div className="flex flex-col gap-5">
              <p className="font-serif text-[19px] italic leading-[1.7] text-[var(--color-bone)]/80 sm:text-[21px]">
                &ldquo;{t.quote}&rdquo;
              </p>
              <p className="text-[11px] tracking-[0.2em] text-[var(--color-ember)]/65 uppercase">
                {t.name} &middot; {t.relation}
              </p>
            </div>
          </motion.div>
        ))}
      </motion.div>
    </section>
  );
}
