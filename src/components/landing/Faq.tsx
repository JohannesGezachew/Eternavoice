"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { fadeUp, stagger } from "@/lib/motion";

const FAQS = [
  {
    q: "Is this ethical?",
    a: "We think carefully about this. EternaVoice is a private grief companion — not a public simulation. You control the voice, you control access, and you can delete everything at any time. We encourage using it alongside, not instead of, professional grief support.",
  },
  {
    q: "How accurate is the voice?",
    a: "Quality depends on the source recording. A quiet, clear two-minute clip typically produces a recognisable voice. Shorter or noisier recordings produce a reasonable approximation. You preview before committing and can always re-clone with a better clip.",
  },
  {
    q: "Who can access my data?",
    a: "Only you. Conversations and memories are encrypted with a key derived from your account — our team cannot read them. We use ElevenLabs for voice synthesis and OpenAI for conversation. Only the text of each turn is sent to them; the voice clone never leaves ElevenLabs.",
  },
  {
    q: "Can I delete everything?",
    a: "Yes. Your account page has a delete option that removes your voice profiles from ElevenLabs, all conversation history from our database, and your account from our auth system — permanently, within seconds.",
  },
  {
    q: "What audio do I need?",
    a: "A voicemail, a video, a voice note — anything with their voice. 30–90 seconds of clear, natural speech is enough to begin. Longer recordings produce richer results but are not required.",
  },
];

export function Faq() {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <section id="faq" className="mx-auto w-full max-w-6xl px-6 py-16 sm:px-8 sm:py-28">
      <motion.div
        initial={false}
        whileInView="enter"
        viewport={{ once: true, amount: 0.15 }}
        variants={stagger(0.06)}
        className="flex flex-col gap-8"
      >
        {/* Header */}
        <motion.div variants={fadeUp} className="flex flex-col gap-3">
          <p className="eyebrow">
            FAQ
          </p>
          <h2 className="font-serif text-[30px] leading-[1.1] tracking-[-0.02em] text-[var(--color-bone)] sm:text-[42px]">
            Questions we hear a lot.
          </h2>
        </motion.div>

        {/* Accordion */}
        <motion.div variants={fadeUp} className="flex flex-col divide-y divide-[var(--color-rule)]">
          {FAQS.map((item, i) => (
            <div key={i}>
              <button
                onClick={() => setOpen(open === i ? null : i)}
                className="flex w-full items-center justify-between gap-6 py-5 text-left transition-colors duration-200 hover:text-[var(--color-bone)]"
                aria-expanded={open === i}
              >
                <span className="font-serif text-[17px] leading-snug text-[var(--color-bone)] sm:text-[19px]">
                  {item.q}
                </span>
                <span
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[var(--color-rule-strong)] text-[var(--color-ember)] transition-transform duration-300"
                  style={{ transform: open === i ? "rotate(45deg)" : "none" }}
                  aria-hidden
                >
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <path d="M5 1v8M1 5h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </span>
              </button>

              <AnimatePresence initial={false}>
                {open === i && (
                  <motion.div
                    key="answer"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                    className="overflow-hidden"
                  >
                    <p className="pb-6 pl-0 text-[14px] leading-[1.8] text-[var(--color-bone-dim)] sm:pl-2">
                      {item.a}
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
        </motion.div>
      </motion.div>
    </section>
  );
}
