"use client";

import { motion } from "framer-motion";
import { fadeUp, stagger } from "@/lib/motion";

interface PageHeaderProps {
  eyebrow: string;
  title: React.ReactNode;
  lede?: React.ReactNode;
  /** Optional slot rendered under the lede (errors, actions). */
  children?: React.ReactNode;
}

/** The one page-header pattern: eyebrow rule, serif title, optional lede. */
export function PageHeader({ eyebrow, title, lede, children }: PageHeaderProps) {
  return (
    <motion.div initial={false} animate="enter" variants={stagger(0.06)} className="max-w-2xl">
      <motion.p variants={fadeUp} className="eyebrow">
        {eyebrow}
      </motion.p>
      <motion.h1
        variants={fadeUp}
        className="font-serif mt-4 text-[30px] leading-[1.08] tracking-[-0.02em] text-balance text-[var(--color-bone)] sm:text-[44px]"
      >
        {title}
      </motion.h1>
      {lede ? (
        <motion.p
          variants={fadeUp}
          className="mt-3 text-[15px] leading-[1.7] text-[var(--color-text-secondary)]"
        >
          {lede}
        </motion.p>
      ) : null}
      {children}
    </motion.div>
  );
}
