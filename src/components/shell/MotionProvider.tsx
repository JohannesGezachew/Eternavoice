"use client";

import { MotionConfig } from "framer-motion";

/**
 * Honors prefers-reduced-motion for every framer-motion animation in the
 * tree. The CSS media-query override in globals.css can't reach JS-driven
 * transforms; this can.
 */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
