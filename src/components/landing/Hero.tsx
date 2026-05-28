"use client";

import Link from "next/link";
import { motion, useScroll, useTransform } from "framer-motion";
import { useRef } from "react";
import { buttonClasses } from "@/components/ui/Button";
import { fadeUp, stagger } from "@/lib/motion";
import { useSession } from "@/lib/session";

export function Hero() {
  const voiceId = useSession((s) => s.voiceId);
  const voiceName = useSession((s) => s.voiceName);
  const hasVoice = Boolean(voiceId);

  const sectionRef = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start start", "end start"],
  });
  const orbY = useTransform(scrollYProgress, [0, 1], [0, -80]);

  return (
    <section ref={sectionRef} className="relative">
      {/* Hero text + orb */}
      <div className="mx-auto w-full max-w-6xl px-6 pt-12 pb-16 sm:px-8 sm:pt-20 sm:pb-20">
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
            <span className="ml-3">EternaVoice</span>
          </motion.p>

          <motion.h1
            variants={fadeUp}
            className="font-serif mt-8 text-[38px] leading-[1.0] tracking-[-0.03em] text-[var(--color-bone)] sm:text-[68px] md:text-[96px] lg:text-[120px]"
            style={{ fontVariationSettings: "'SOFT' 50, 'opsz' 144" }}
          >
            Speak with them
            <br />
            <span
              className="italic text-[var(--color-bone)]/80"
              style={{ fontVariationSettings: "'SOFT' 100, 'opsz' 144" }}
            >
              again.
            </span>
          </motion.h1>

          <motion.p
            variants={fadeUp}
            className="mt-10 max-w-lg text-[17px] leading-[1.78] text-pretty text-[var(--color-bone)]/65 sm:text-[19px]"
          >
            Voice conversations with someone you&rsquo;ve lost, built carefully
            from their own recordings &mdash; a voicemail, a video, a home clip.
            Private, considered, and entirely yours.
          </motion.p>

          <motion.div
            variants={fadeUp}
            className="mt-14 flex flex-col items-start gap-5"
          >
            <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:gap-6">
              <div className="group/btn relative">
                <div
                  className="pointer-events-none absolute inset-[-6px] rounded-full bg-[rgba(199,162,124,0.08)] blur-[20px] transition-all duration-500 group-hover/btn:bg-[rgba(199,162,124,0.18)] group-hover/btn:blur-[28px]"
                  aria-hidden
                />
                <Link
                  href={hasVoice ? "/conversation" : "/record"}
                  className={buttonClasses({ size: "lg", variant: "primary" })}
                >
                  Begin
                </Link>
              </div>
              <p className="text-[13px] text-[var(--color-bone-dim)]">
                {hasVoice && voiceName
                  ? `Pick up with ${voiceName}.`
                  : "Ninety seconds of voice. One conversation away."}
              </p>
            </div>
            <p className="text-[12px] tracking-[0.04em] text-[var(--color-bone-dim)]/70">
              No voice is ever shared. Everything stays on your account.
            </p>
          </motion.div>
        </motion.div>

        {/* Orb — parallax on scroll */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 2, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
          style={{ y: orbY }}
          className="pointer-events-none absolute top-[44%] right-[-4%] hidden h-[560px] w-[560px] -translate-y-1/2 lg:block"
          aria-hidden
        >
          <Orb />
        </motion.div>
      </div>

      {/* Voice waveform — the product's visual signature */}
      <div className="mx-auto w-full max-w-6xl px-6 pb-28 sm:px-8 sm:pb-36">
        <VoiceWave />
      </div>

      {/* Scroll cue */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1.2, delay: 1.4, ease: [0.16, 1, 0.3, 1] }}
        className="absolute bottom-8 left-1/2 hidden -translate-x-1/2 flex-col items-center gap-2 sm:flex"
        aria-hidden
      >
        <div className="relative h-8 w-px overflow-hidden rounded-full bg-[var(--color-ember)]/20">
          <div
            className="absolute inset-x-0 h-1/2 rounded-full bg-[var(--color-ember)]/70"
            style={{ animation: "scrollLine 1.8s cubic-bezier(0.4,0,0.6,1) infinite" }}
          />
        </div>
      </motion.div>

      {/* Fade into next section */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-64"
        aria-hidden
        style={{
          background:
            "linear-gradient(to bottom, transparent 0%, var(--color-ink) 100%)",
        }}
      />
    </section>
  );
}

function VoiceWave() {
  return (
    <div className="relative h-14 w-full" style={{ animation: "waveBreath 4s ease-in-out infinite" }}>
      <svg
        viewBox="0 0 1200 60"
        preserveAspectRatio="none"
        className="h-full w-full"
        aria-hidden
      >
        {/* Shadow path for depth */}
        <path
          d="M 0,30 L 80,30 C 92,30 92,24 104,24 C 116,24 116,36 128,36 C 140,36 140,20 154,20 C 166,20 166,40 178,40 C 190,40 190,16 204,16 C 218,16 218,44 230,44 C 242,44 242,14 256,14 C 270,14 270,48 282,48 C 294,48 294,16 308,16 C 322,16 322,46 334,46 C 344,46 344,12 358,12 C 372,12 372,50 384,50 C 396,50 396,18 410,18 C 424,18 424,44 436,44 C 446,44 446,12 460,12 C 474,12 474,50 486,50 C 498,50 498,20 512,20 C 526,20 526,42 538,42 C 548,42 548,14 562,14 C 576,14 576,48 588,48 C 600,48 600,18 614,18 C 628,18 628,44 640,44 C 650,44 650,14 664,14 C 678,14 678,48 690,48 C 702,48 702,20 716,20 C 730,20 730,42 742,42 C 752,42 752,16 766,16 C 780,16 780,46 792,46 C 804,46 804,22 818,22 C 832,22 832,40 844,40 C 854,40 854,18 868,18 C 882,18 882,44 894,44 C 906,44 906,24 920,24 C 934,24 934,36 946,36 C 956,36 956,22 968,22 C 980,22 980,38 992,38 C 1004,38 1004,26 1018,26 C 1032,26 1032,34 1044,34 C 1056,34 1056,28 1070,28 C 1084,28 1084,32 1096,32 L 1200,30"
          stroke="rgba(199,162,124,0.14)"
          strokeWidth="1.5"
          fill="none"
          strokeLinecap="round"
          transform="translate(0,6)"
        />
        {/* Primary waveform */}
        <path
          d="M 0,30 L 80,30 C 92,30 92,24 104,24 C 116,24 116,36 128,36 C 140,36 140,20 154,20 C 166,20 166,40 178,40 C 190,40 190,16 204,16 C 218,16 218,44 230,44 C 242,44 242,14 256,14 C 270,14 270,48 282,48 C 294,48 294,16 308,16 C 322,16 322,46 334,46 C 344,46 344,12 358,12 C 372,12 372,50 384,50 C 396,50 396,18 410,18 C 424,18 424,44 436,44 C 446,44 446,12 460,12 C 474,12 474,50 486,50 C 498,50 498,20 512,20 C 526,20 526,42 538,42 C 548,42 548,14 562,14 C 576,14 576,48 588,48 C 600,48 600,18 614,18 C 628,18 628,44 640,44 C 650,44 650,14 664,14 C 678,14 678,48 690,48 C 702,48 702,20 716,20 C 730,20 730,42 742,42 C 752,42 752,16 766,16 C 780,16 780,46 792,46 C 804,46 804,22 818,22 C 832,22 832,40 844,40 C 854,40 854,18 868,18 C 882,18 882,44 894,44 C 906,44 906,24 920,24 C 934,24 934,36 946,36 C 956,36 956,22 968,22 C 980,22 980,38 992,38 C 1004,38 1004,26 1018,26 C 1032,26 1032,34 1044,34 C 1056,34 1056,28 1070,28 C 1084,28 1084,32 1096,32 L 1200,30"
          stroke="rgba(199,162,124,0.40)"
          strokeWidth="1.5"
          fill="none"
          strokeLinecap="round"
        />
      </svg>
      {/* Horizontal edge fades so the wave dissolves at both ends */}
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden
        style={{
          background:
            "linear-gradient(to right, var(--color-ink) 0%, transparent 7%, transparent 93%, var(--color-ink) 100%)",
        }}
      />
    </div>
  );
}

function Orb() {
  return (
    <div className="relative h-full w-full">
      {/* Concentric sound rings */}
      <div
        className="absolute inset-[-22%] animate-[ring_8s_ease-in-out_infinite] rounded-full border border-[rgba(199,162,124,0.05)]"
        style={{ animationDelay: "2s" }}
      />
      <div
        className="absolute inset-[-11%] animate-[ring_8s_ease-in-out_infinite] rounded-full border border-[rgba(199,162,124,0.08)]"
        style={{ animationDelay: "1s" }}
      />
      <div className="absolute inset-0 animate-[ring_8s_ease-in-out_infinite] rounded-full border border-[rgba(199,162,124,0.13)]" />
      {/* Main breathing glow */}
      <div className="absolute inset-0 animate-[breathe_7s_ease-in-out_infinite] rounded-full bg-[radial-gradient(closest-side,rgba(199,162,124,0.50),rgba(199,162,124,0.06)_55%,transparent_75%)] blur-[2px]" />
      {/* Inner sphere */}
      <div className="absolute inset-[14%] rounded-full border border-[var(--color-rule-strong)] bg-[radial-gradient(closest-side,rgba(245,239,230,0.09),transparent_70%)]" />
      {/* Core */}
      <div className="absolute inset-[34%] rounded-full bg-[radial-gradient(closest-side,rgba(245,239,230,0.24),transparent_70%)] mix-blend-screen" />
      <style>{`
        @keyframes breathe {
          0%, 100% { transform: scale(1); opacity: 0.9; }
          50% { transform: scale(1.05); opacity: 1; }
        }
        @keyframes ring {
          0%, 100% { opacity: 0.5; transform: scale(0.98); }
          50% { opacity: 1; transform: scale(1.015); }
        }
        @media (prefers-reduced-motion: reduce) {
          [class*="animate-[breathe"], [class*="animate-[ring"] {
            animation: none;
          }
        }
      `}</style>
    </div>
  );
}
