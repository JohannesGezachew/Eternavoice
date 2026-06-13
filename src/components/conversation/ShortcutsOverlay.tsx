"use client";

import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

const SHORTCUTS: Array<{ keys: string[]; label: string }> = [
  { keys: ["Space"], label: "Interrupt the voice" },
  { keys: ["A"], label: "Toggle ambient mode" },
  { keys: ["T"], label: "Toggle transcript" },
  { keys: ["N"], label: "New conversation" },
  { keys: ["Esc"], label: "Close this panel" },
  { keys: ["?"], label: "Show shortcuts" },
];

/** Keyboard-shortcut reference, opened with "?" on desktop. */
export function ShortcutsOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 z-[120] bg-black/55 backdrop-blur-[3px]"
            aria-hidden
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Keyboard shortcuts"
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
            className="hairline fixed left-1/2 top-1/2 z-[121] w-[min(92vw,360px)] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-[var(--color-ink-2)]/97 p-6 shadow-2xl backdrop-blur-xl"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-serif text-[18px] text-[var(--color-bone)]">Keyboard shortcuts</h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-[var(--color-bone-dim)] transition hover:text-[var(--color-bone)]"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>
            <ul className="flex flex-col gap-2.5">
              {SHORTCUTS.map(({ keys, label }) => (
                <li key={label} className="flex items-center justify-between gap-4">
                  <span className="text-[13px] text-[var(--color-bone-dim)]">{label}</span>
                  <span className="flex gap-1">
                    {keys.map((k) => (
                      <kbd
                        key={k}
                        className="rounded-md border border-[var(--color-rule-strong)] bg-white/[0.03] px-2 py-0.5 font-sans text-[11px] text-[var(--color-bone)]/85"
                      >
                        {k}
                      </kbd>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
