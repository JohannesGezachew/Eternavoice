"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { useRef, useEffect, useSyncExternalStore } from "react";
import { useSession } from "@/lib/session";
import { buttonClasses } from "@/components/ui/buttonClasses";
import { ConversationDemo } from "./ConversationDemo";

const HEADLINE = ["Speak", "with", "them"];

const subscribeNoop = () => () => {};

export function Hero() {
  const voiceId = useSession((s) => s.voiceId);
  const voiceName = useSession((s) => s.voiceName);
  // Session state lives in localStorage; gate it behind hydration so the
  // static prerender and the first client render are identical.
  const mounted = useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false,
  );
  const hasVoice = mounted && Boolean(voiceId);

  return (
    <section className="relative overflow-hidden">
      {/* Dot grid — mask clips only this sibling div, never content */}
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden
        style={{
          backgroundImage: "radial-gradient(var(--dot-grid) 0.8px, transparent 0.8px)",
          backgroundSize: "22px 22px",
          WebkitMaskImage: "radial-gradient(ellipse 110% 70% at 50% 0%, rgba(0,0,0,1) 0%, transparent 85%)",
          maskImage: "radial-gradient(ellipse 110% 70% at 50% 0%, rgba(0,0,0,1) 0%, transparent 85%)",
        }}
      />

      {/* Ambient glow behind the demo panel on desktop */}
      <div
        className="pointer-events-none absolute right-[3%] top-[10%] hidden h-[560px] w-[560px] rounded-full opacity-[0.18] blur-[110px] lg:block"
        aria-hidden
        style={{ background: "radial-gradient(closest-side, rgba(194,120,74,0.6), transparent 72%)" }}
      />

      {/* Two-column hero grid */}
      <div className="mx-auto w-full max-w-7xl px-6 pt-12 pb-12 sm:px-8 sm:pt-20 sm:pb-16">
        <div className="grid items-start gap-12 lg:grid-cols-2 lg:gap-16 xl:gap-24">

          {/* ─── Text column ─── */}
          <div>

            {/* Headline — word-by-word blur entrance, pure CSS so the LCP
                text never waits for JS hydration. */}
            <h1
              className="font-serif mt-7 text-[52px] leading-[1.0] tracking-[-0.03em] text-[var(--color-bone)] sm:text-[72px] lg:text-[68px] xl:text-[88px]"
              style={{ fontVariationSettings: "'SOFT' 50, 'opsz' 144" }}
            >
              <span className="block">
                {HEADLINE.map((word, i) => (
                  <span
                    key={word}
                    className="hero-word"
                    style={{ marginRight: "0.22em", animationDelay: `${0.1 + i * 0.08}s` }}
                  >
                    {word}
                  </span>
                ))}
              </span>
              <span
                className="hero-word italic text-[var(--color-bone)]/80"
                style={{ fontVariationSettings: "'SOFT' 100, 'opsz' 144", animationDelay: "0.34s" }}
              >
                again.
              </span>
            </h1>

            {/* Sub-headline */}
            <motion.p
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.42, ease: [0.16, 1, 0.3, 1] }}
              className="mt-7 max-w-md text-[16px] leading-[1.7] text-[var(--color-bone)]/60 sm:text-[18px]"
            >
              Real conversations in the voice of someone you&rsquo;ve lost, built from recordings you already have.
            </motion.p>

            {/* Demo — mobile only, between text and CTAs so it's above the fold */}
            <motion.div
              initial={{ opacity: 0, y: 28 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.65, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
              className="mt-8 lg:hidden"
            >
              <ConversationDemo />
            </motion.div>

            {/* CTAs */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.5, ease: [0.16, 1, 0.3, 1] }}
              className="mt-10 flex flex-col items-start gap-5"
            >
              <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:gap-6">
                <div className="group/btn relative">
                  <div
                    className="pointer-events-none absolute inset-[-6px] rounded-full bg-[rgba(194,120,74,0.08)] blur-[20px] transition-all duration-500 group-hover/btn:bg-[rgba(194,120,74,0.18)] group-hover/btn:blur-[28px]"
                    aria-hidden
                  />
                  <Link
                    href={hasVoice ? "/people/current/talk" : "/auth/login"}
                    className={buttonClasses({ variant: "primary", size: "lg" })}
                  >
                    {hasVoice ? "Continue" : "Start with a voicemail"}
                  </Link>
                </div>
                {!hasVoice && (
                  <button
                    type="button"
                    onClick={() => {
                      document.getElementById("how-it-works")?.scrollIntoView({ behavior: "smooth" });
                    }}
                    className="flex items-center gap-1.5 text-[14px] text-[var(--color-bone-dim)] transition hover:text-[var(--color-bone)]"
                  >
                    See how it works
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M12 5v14M5 12l7 7 7-7" />
                    </svg>
                  </button>
                )}
              </div>
              <div className="flex flex-col gap-1">
                {!hasVoice && (
                  <p className="flex items-center gap-2 text-[12px] text-[var(--color-text-tertiary)]">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    7 days free · No card required
                  </p>
                )}
                <p className="text-[12px] tracking-[0.02em] text-[var(--color-text-secondary)]">
                  Their voice never leaves your account, and is never shared.
                </p>
              </div>
            </motion.div>
          </div>

          {/* ─── Product demo column — desktop only ─── */}
          <motion.div
            initial={{ opacity: 0, y: 28 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.65, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
            className="relative hidden lg:block lg:pt-4"
          >
            <ConversationDemo />
          </motion.div>

        </div>
      </div>

      {/* Voice waveform — visual separator between hero and stats */}
      <div className="relative mx-auto w-full max-w-6xl overflow-hidden px-0">
        <VoiceWave />
      </div>

      {/* Scroll cue */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1.2, delay: 1.5, ease: [0.16, 1, 0.3, 1] }}
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
          background: "linear-gradient(to bottom, transparent 0%, var(--color-ink) 100%)",
        }}
      />
    </section>
  );
}

function VoiceWave() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let logW = 0;
    let logH = 0;
    let raf = 0;
    let t = 0;

    function setSize() {
      const rect = canvas!.getBoundingClientRect();
      logW = rect.width;
      logH = rect.height;
      canvas!.width = logW * dpr;
      canvas!.height = logH * dpr;
      ctx!.scale(dpr, dpr);
    }

    setSize();
    const ro = new ResizeObserver(setSize);
    ro.observe(canvas);

    // Stop drawing while scrolled out of view — the wave sits at the fold
    // and would otherwise animate under the whole page.
    let visible = true;
    const io = new IntersectionObserver(([entry]) => {
      const nowVisible = Boolean(entry?.isIntersecting);
      if (nowVisible && !visible) {
        visible = true;
        raf = requestAnimationFrame(frame);
      } else if (!nowVisible) {
        visible = false;
        cancelAnimationFrame(raf);
      }
    });
    io.observe(canvas);

    function harmonics(x: number, speed: number, phase: number) {
      return (
        Math.sin(x * 0.0070 + speed + phase) * 0.45 +
        Math.sin(x * 0.0120 + speed * 1.3 + phase) * 0.28 +
        Math.sin(x * 0.0195 + speed * 0.8 + phase) * 0.16 +
        Math.sin(x * 0.0310 + speed * 2.0 + phase) * 0.11
      );
    }

    function drawLayer(speed: number, phase: number, amp: number, opacity: number, glow: number) {
      const cy = logH / 2;

      ctx!.beginPath();
      for (let px = 0; px <= logW; px++) {
        const xn = px / logW;
        const fade = Math.pow(Math.sin(xn * Math.PI), 0.55);
        const y = cy + harmonics(px, speed, phase) * amp * fade;
        px === 0 ? ctx!.moveTo(px, y) : ctx!.lineTo(px, y);
      }

      const g = ctx!.createLinearGradient(0, 0, logW, 0);
      g.addColorStop(0,    "rgba(194,120,74,0)");
      g.addColorStop(0.12, `rgba(194,120,74,${opacity * 0.5})`);
      g.addColorStop(0.5,  `rgba(194,120,74,${opacity})`);
      g.addColorStop(0.88, `rgba(194,120,74,${opacity * 0.5})`);
      g.addColorStop(1,    "rgba(194,120,74,0)");

      ctx!.strokeStyle = g;
      ctx!.lineWidth = 1.5;
      ctx!.lineCap = "round";
      ctx!.lineJoin = "round";

      if (glow > 0) {
        ctx!.shadowColor = "rgba(194,120,74,0.45)";
        ctx!.shadowBlur = glow;
      }
      ctx!.stroke();
      ctx!.shadowBlur = 0;
    }

    function frame() {
      ctx!.clearRect(0, 0, logW, logH);
      t += 0.011;

      drawLayer(t * 0.60, 0,                 12, 0.10, 0);
      drawLayer(t * 1.00, Math.PI * 0.35,    19, 0.20, 0);
      drawLayer(t * 1.45, Math.PI * 1.10,    15, 0.48, 9);

      raf = requestAnimationFrame(frame);
    }

    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
    };
  }, []);

  return (
    <div className="relative h-16 w-full" aria-hidden>
      <canvas ref={canvasRef} className="h-full w-full" style={{ display: "block" }} />
    </div>
  );
}
