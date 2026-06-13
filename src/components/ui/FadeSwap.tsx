"use client";

import { motion, AnimatePresence } from "framer-motion";

/**
 * Crossfades between states keyed by `swapKey` (e.g. "loading" → "ready"), so
 * a skeleton dissolves into content instead of popping. Honours reduced-motion
 * implicitly via the short, transform-free fade.
 */
export function FadeSwap({
  swapKey,
  children,
  className,
}: {
  swapKey: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={swapKey}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
        className={className}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
