"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { buttonClasses } from "@/components/ui/Button";
import { fadeUp, stagger } from "@/lib/motion";
import { useSession } from "@/lib/session";

export function Hero() {
  const voiceId = useSession((s) => s.voiceId);
  const voiceName = useSession((s) => s.voiceName);

  const hasVoice = Boolean(voiceId);
  return (
    <section className="relative">
      <div className="mx-auto w-full max-w-6xl px-6 pt-12 pb-24 sm:px-8 sm:pt-20 sm:pb-32">
        <motion.div
          initial={false}
          animate="enter"
          variants={stagger(0.08)}
          className="max-w-3xl"
        >
          <motion.p
            variants={fadeUp}
            className="text-[12px] tracking-[0.22em] text-[var(--color-bone-dim)] uppercase"
          >
            <span className="inline-block h-1.5 w-1.5 translate-y-[-2px] rounded-full bg-[var(--color-ember)] align-middle" />
            <span className="ml-3">EternaVoice · v1</span>
          </motion.p>

          <motion.h1
            variants={fadeUp}
            className="font-serif mt-7 text-[44px] leading-[1.04] tracking-[-0.02em] text-balance text-[var(--color-bone)] sm:text-[64px] md:text-[80px]"
          >
            Speak with them
            <br />
            <span className="italic text-[var(--color-bone)]/85">again.</span>
          </motion.h1>

          <motion.p
            variants={fadeUp}
            className="mt-8 max-w-xl text-[17px] leading-[1.7] text-pretty text-[var(--color-bone)]/70 sm:text-[18px]"
          >
            Continuous voice conversations with someone you can no longer reach.
            Built from what they left behind. Private, considered, and entirely
            your own.
          </motion.p>

          <motion.div
            variants={fadeUp}
            className="mt-12 flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:gap-6"
          >
            <Link
              href={hasVoice ? "/conversation" : "/record"}
              className={buttonClasses({ size: "lg", variant: "primary" })}
            >
              Begin
            </Link>
            <p className="text-[13px] text-[var(--color-bone-dim)]">
              {hasVoice && voiceName
                ? `Pick up with ${voiceName}.`
                : "Ninety seconds of voice. One conversation away."}
            </p>
          </motion.div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1.6, delay: 0.4, ease: [0.16, 1, 0.3, 1] }}
          className="pointer-events-none absolute top-1/2 right-0 hidden h-[420px] w-[420px] -translate-y-1/2 translate-x-1/4 lg:block"
          aria-hidden
        >
          <Orb />
        </motion.div>
      </div>
    </section>
  );
}

function Orb() {
  return (
    <div className="relative h-full w-full">
      <div className="absolute inset-0 animate-[breathe_7s_ease-in-out_infinite] rounded-full bg-[radial-gradient(closest-side,rgba(199,162,124,0.32),rgba(199,162,124,0.04)_55%,transparent_75%)] blur-[2px]" />
      <div className="absolute inset-[14%] rounded-full border border-[var(--color-rule-strong)] bg-[radial-gradient(closest-side,rgba(245,239,230,0.06),transparent_70%)]" />
      <div className="absolute inset-[34%] rounded-full bg-[radial-gradient(closest-side,rgba(245,239,230,0.18),transparent_70%)] mix-blend-screen" />
      <style>{`
        @keyframes breathe {
          0%, 100% { transform: scale(1); opacity: 0.95; }
          50% { transform: scale(1.04); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
