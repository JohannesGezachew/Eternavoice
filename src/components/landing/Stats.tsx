"use client";

import { useRef, useEffect, useState } from "react";
import { motion, useInView } from "framer-motion";
import { stagger, fadeUp } from "@/lib/motion";

const STATS = [
  { target: 500, display: "500+", label: "Voice profiles", labelFull: "Voice profiles created" },
  { target: 10000, display: "10,000+", label: "Conversations", labelFull: "Conversations had" },
  { target: 34, display: "34", label: "Countries", labelFull: "Countries" },
];

function CountUp({ target, display }: { target: number; display: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-5% 0px" });
  const [text, setText] = useState("0");

  useEffect(() => {
    if (!inView) return;

    const duration = 1400;
    const startTime = performance.now();

    const tick = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Cubic ease-out
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.floor(eased * target);

      if (target >= 10000) {
        setText(`${Math.floor(current / 1000)}k`);
      } else {
        setText(current.toString());
      }

      if (progress < 1) {
        requestAnimationFrame(tick);
      } else {
        setText(display);
      }
    };

    requestAnimationFrame(tick);
  }, [inView, target, display]);

  return <span ref={ref}>{text}</span>;
}

export function Stats() {
  return (
    <section className="mx-auto w-full max-w-6xl px-6 sm:px-8">
      <motion.div
        initial={false}
        whileInView="enter"
        viewport={{ once: true, amount: 0.5 }}
        variants={stagger(0.1)}
        className="grid grid-cols-3 divide-x divide-[var(--color-rule)] border-t border-b border-[var(--color-rule)] py-12"
      >
        {STATS.map(({ target, display, label, labelFull }) => (
          <motion.div
            key={label}
            variants={fadeUp}
            className="flex flex-col items-center gap-1.5 px-1 text-center sm:px-4"
          >
            <span className="font-serif text-[21px] leading-none tracking-[-0.03em] text-[var(--color-bone)] tabular-nums xs:text-[26px] sm:text-[48px]">
              <CountUp target={target} display={display} />
            </span>
            <span className="text-[9px] leading-snug text-[var(--color-bone-dim)]/60 xs:text-[10px] sm:text-[12px]">
              <span className="sm:hidden">{label}</span>
              <span className="hidden sm:inline">{labelFull}</span>
            </span>
          </motion.div>
        ))}
      </motion.div>
    </section>
  );
}
