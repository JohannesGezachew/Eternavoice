"use client";

import { motion, useMotionValue, useTransform, animate } from "framer-motion";
import { useEffect } from "react";
import type { ConversationStatus } from "@/lib/types";

interface OrbProps {
  status: ConversationStatus;
  amplitude: number;
}

export function Orb({ status, amplitude }: OrbProps) {
  const scale = useMotionValue(1);
  const glow = useMotionValue(0.45);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const target =
        status === "speaking"
          ? 1 + Math.min(0.42, amplitude * 4.5)
          : status === "thinking"
            ? 1.04 + Math.sin(performance.now() / 720) * 0.03
            : status === "transcribing"
              ? 1.02
              : 1.0;
      scale.set(scale.get() * 0.82 + target * 0.18);
      const glowTarget =
        status === "speaking"
          ? 0.55 + Math.min(0.45, amplitude * 6)
          : status === "thinking"
            ? 0.6 + Math.sin(performance.now() / 720) * 0.1
            : 0.4;
      glow.set(glow.get() * 0.85 + glowTarget * 0.15);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [status, amplitude, scale, glow]);

  useEffect(() => {
    if (status === "idle") {
      const controls = animate(scale, 1, { duration: 0.8, ease: [0.16, 1, 0.3, 1] });
      return () => controls.stop();
    }
  }, [status, scale]);

  const haloOpacity = useTransform(glow, (v) => v);
  const ringOpacity = useTransform(glow, (v) => Math.min(1, v + 0.2));

  return (
    <div className="relative grid h-full w-full place-items-center" aria-hidden>
      <motion.div
        style={{ scale, opacity: haloOpacity }}
        className="absolute h-[120%] w-[120%] rounded-full blur-[60px]"
      >
        <div className="h-full w-full rounded-full bg-[radial-gradient(closest-side,rgba(199,162,124,0.55),rgba(199,162,124,0.05)_60%,transparent_75%)]" />
      </motion.div>
      <motion.div
        style={{ scale, opacity: ringOpacity }}
        className="absolute h-[78%] w-[78%] rounded-full border border-[var(--color-rule-strong)] bg-[radial-gradient(closest-side,rgba(245,239,230,0.07),transparent_70%)]"
      />
      <motion.div
        style={{ scale }}
        className="relative h-[42%] w-[42%] rounded-full bg-[radial-gradient(closest-side,rgba(245,239,230,0.32),rgba(199,162,124,0.18)_60%,transparent_85%)] mix-blend-screen"
      />
      <motion.div
        style={{ scale }}
        className="absolute h-[12%] w-[12%] rounded-full bg-[var(--color-bone)]/65 blur-[6px]"
      />
    </div>
  );
}
