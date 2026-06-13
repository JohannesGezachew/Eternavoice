"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Smooths streamed text. The server emits whole polished sentences at once, so
 * the raw text jumps in chunks; this reveals it a few characters per frame so
 * the spotlight reads like it's being spoken into being rather than pasted.
 *
 * - Reveals toward the target length with a rate proportional to how far behind
 *   it is, so a big jump catches up quickly without ever feeling instant.
 * - Snaps immediately when the target shrinks or is replaced (new turn), so we
 *   never animate backwards.
 * - Respects prefers-reduced-motion: returns the full text with no animation.
 */
export function useSmoothText(target: string, enabled = true): string {
  const [shown, setShown] = useState(target);
  const shownLenRef = useRef(target.length);
  const targetRef = useRef(target);

  useEffect(() => {
    targetRef.current = target;
    if (!enabled) {
      shownLenRef.current = target.length;
      setShown(target);
      return;
    }

    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      shownLenRef.current = target.length;
      setShown(target);
      return;
    }

    // A shrink or full replacement (new turn / cleared spotlight): snap.
    if (
      target.length < shownLenRef.current ||
      !target.startsWith(shown.slice(0, Math.min(shown.length, 8)))
    ) {
      shownLenRef.current = target.length;
      setShown(target);
      return;
    }

    let raf = 0;
    const step = () => {
      const full = targetRef.current;
      const behind = full.length - shownLenRef.current;
      if (behind <= 0) {
        if (shownLenRef.current !== full.length) {
          shownLenRef.current = full.length;
          setShown(full);
        }
        return;
      }
      // Catch up faster the further behind we are; always at least 1/frame.
      const advance = Math.max(1, Math.ceil(behind * 0.18));
      shownLenRef.current = Math.min(full.length, shownLenRef.current + advance);
      setShown(full.slice(0, shownLenRef.current));
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, enabled]);

  return enabled ? shown : target;
}
