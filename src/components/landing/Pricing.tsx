"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { fadeUp, stagger } from "@/lib/motion";

const FEATURES = [
  "Unlimited voice conversations",
  "Up to 10 voice profiles",
  "Memory that persists across every session",
  "AES-256 encrypted — your data stays yours",
  "Access on any device, any time",
  "Cancel anytime — data deleted on request",
];

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="mt-0.5 shrink-0" aria-hidden>
      <circle cx="8" cy="8" r="7.5" stroke="rgba(201,153,106,0.25)" />
      <path d="M5 8.5l2 2 4-4" stroke="var(--color-ember)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Pricing() {
  return (
    <section id="pricing" className="relative mx-auto w-full max-w-6xl px-6 py-16 sm:px-8 sm:py-20">
      {/* Atmospheric glow */}
      <div className="pointer-events-none absolute left-1/2 top-0 h-[40%] w-[50%] -translate-x-1/2 rounded-full opacity-40 blur-[100px]" aria-hidden
        style={{ background: "radial-gradient(closest-side, rgba(201,153,106,0.22), transparent 75%)" }} />

      <motion.div
        initial={false}
        whileInView="enter"
        viewport={{ once: true, amount: 0.2 }}
        variants={stagger(0.08)}
        className="relative flex flex-col items-center gap-10"
      >
        {/* Label */}
        <motion.p variants={fadeUp} className="eyebrow-center">
          Pricing
        </motion.p>

        {/* Headline */}
        <motion.div variants={fadeUp} className="flex flex-col items-center gap-3 text-center">
          <h2 className="font-serif text-[32px] leading-[1.05] tracking-[-0.02em] text-[var(--color-bone)] sm:text-[48px]">
            One plan. Everything included.
          </h2>
          <p className="max-w-sm text-[16px] leading-relaxed text-[var(--color-bone-dim)]">
            Start free for 7 days — no card required to begin.
          </p>
        </motion.div>

        {/* Card */}
        <motion.div
          variants={fadeUp}
          className="w-full max-w-sm overflow-hidden rounded-2xl border border-[var(--color-rule-strong)]"
          style={{
            background: "linear-gradient(160deg, rgba(255,255,255,0.028) 0%, rgba(255,255,255,0.01) 100%)",
            boxShadow: "0 0 0 1px rgba(201,153,106,0.06) inset, 0 32px 64px rgba(0,0,0,0.35)",
          }}
        >
          {/* Card header */}
          <div className="border-b border-[var(--color-rule)] px-8 py-7">
            <p className="text-[12px] tracking-[0.14em] text-[var(--color-bone-dim)]/60 uppercase">EternaVoice</p>
            <div className="mt-3 flex items-baseline gap-2.5">
              <span className="font-serif text-[52px] leading-none tracking-[-0.03em] text-[var(--color-bone)]">£30</span>
              <div className="flex flex-col leading-tight">
                <span className="text-[13px] text-[var(--color-bone-dim)]">/month</span>
                <span className="text-[11px] text-[var(--color-bone-dim)]/50">after 7-day free trial</span>
              </div>
            </div>
            <p className="mt-3 text-[11px] italic text-[var(--color-bone-dim)]/65">
              Less than one therapy session — no appointment, no time limit.
            </p>
          </div>

          {/* Features */}
          <div className="flex flex-col gap-3.5 px-8 py-6">
            {FEATURES.map((f) => (
              <div key={f} className="flex items-start gap-3">
                <CheckIcon />
                <span className="text-[13px] leading-[1.55] text-[var(--color-bone-dim)]">{f}</span>
              </div>
            ))}
          </div>

          {/* CTA */}
          <div className="flex flex-col gap-3 px-8 pb-8">
            <Link
              href="/auth/login"
              className="flex h-12 w-full items-center justify-center rounded-xl bg-[var(--color-ember)] text-[14px] font-medium text-[var(--color-ink)] shadow-[0_1px_0_rgba(255,255,255,0.2)_inset,0_8px_24px_-8px_rgba(201,153,106,0.55)] transition-all duration-300 hover:opacity-90 active:scale-[0.99]"
            >
              Start 7-day free trial
            </Link>
            <p className="text-center text-[11px] leading-relaxed text-[var(--color-bone-dim)]/40">
              No card required to start · Cancel anytime
            </p>
          </div>
        </motion.div>
      </motion.div>
    </section>
  );
}
