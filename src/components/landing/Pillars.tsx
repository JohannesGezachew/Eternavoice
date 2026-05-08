"use client";

import { motion } from "framer-motion";
import { fadeUp, stagger } from "@/lib/motion";

const items = [
  {
    label: "01",
    title: "A voice, recovered.",
    body: "Ninety seconds of source audio is enough. The clone is created the moment you finish recording — no waiting room, no preview screen. The conversation simply begins.",
  },
  {
    label: "02",
    title: "A presence, restored.",
    body: "Responses that sound like the person speaking, not a chatbot. Cadence, pauses, the things they’d never say. We tuned for the shape of someone, not the shape of a model.",
  },
  {
    label: "03",
    title: "A relationship, kept.",
    body: "Replies under two seconds, streamed sentence by sentence. The rhythm of a real conversation, on the device already in your hand.",
  },
];

export function Pillars() {
  return (
    <section className="relative">
      <div className="mx-auto w-full max-w-6xl px-6 pb-24 sm:px-8">
        <motion.div
          initial="initial"
          whileInView="enter"
          viewport={{ once: true, amount: 0.2 }}
          variants={stagger(0.1)}
          className="grid gap-px overflow-hidden rounded-2xl border border-[var(--color-rule-strong)] bg-[var(--color-rule-strong)] sm:grid-cols-3"
        >
          {items.map((item) => (
            <motion.div
              key={item.label}
              variants={fadeUp}
              className="flex flex-col gap-5 bg-[var(--color-ink)]/85 p-7 backdrop-blur-xl sm:p-9"
            >
              <span className="text-[11px] tracking-[0.22em] text-[var(--color-bone-dim)]">
                {item.label}
              </span>
              <h3 className="font-serif text-[24px] leading-[1.15] tracking-[-0.01em] text-[var(--color-bone)] sm:text-[28px]">
                {item.title}
              </h3>
              <p className="text-[15px] leading-[1.7] text-pretty text-[var(--color-bone)]/65">
                {item.body}
              </p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
