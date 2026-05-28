"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { buttonClasses } from "@/components/ui/Button";
import { fadeUp, stagger } from "@/lib/motion";

export function CtaBanner() {
  return (
    <section className="mx-auto w-full max-w-6xl px-6 py-8 pb-20 sm:px-8">
      <div className="relative overflow-hidden rounded-2xl border border-[rgba(199,162,124,0.18)] bg-[var(--color-ink-3)] px-8 py-16 text-center sm:px-12 sm:py-20">
        <div
          className="pointer-events-none absolute inset-0"
          aria-hidden
          style={{
            background:
              "radial-gradient(ellipse 100% 80% at 50% 115%, rgba(199,162,124,0.26), transparent 70%)",
          }}
        />

        <motion.div
          initial={false}
          whileInView="enter"
          viewport={{ once: true, amount: 0.4 }}
          variants={stagger(0.1)}
          className="relative"
        >
          <motion.h2
            variants={fadeUp}
            className="font-serif text-[34px] leading-[1.08] tracking-[-0.025em] text-balance text-[var(--color-bone)] sm:text-[50px] lg:text-[60px]"
            style={{ fontVariationSettings: "'SOFT' 50, 'opsz' 144" }}
          >
            You already know whose voice
            <br className="hidden sm:block" />
            <span
              className="italic text-[var(--color-bone)]/85"
              style={{ fontVariationSettings: "'SOFT' 100, 'opsz' 144" }}
            >
              {" "}you want to preserve.
            </span>
          </motion.h2>

          <motion.p
            variants={fadeUp}
            className="mx-auto mt-6 max-w-md text-[17px] leading-[1.7] text-[var(--color-bone)]/60 sm:text-[18px]"
          >
            Start with ninety seconds of audio. The conversation can last as long as you need it to.
          </motion.p>

          <motion.div
            variants={fadeUp}
            className="mt-10 flex flex-col items-center gap-4"
          >
            <Link
              href="/record"
              className={buttonClasses({ size: "lg", variant: "primary" })}
            >
              Begin
            </Link>
            <p className="text-[12px] text-[var(--color-bone-dim)]">
              Private by design. No voice is ever shared.
            </p>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
