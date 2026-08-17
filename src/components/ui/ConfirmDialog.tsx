"use client";

import { useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { buttonClasses } from "./buttonClasses";
import { useFocusTrap } from "@/lib/useFocusTrap";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel?: string;
  /** Visual tone of the confirm action. Destructive actions render in danger. */
  tone?: "danger" | "default";
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  cancelLabel = "Cancel",
  tone = "danger",
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap(open, panelRef, onCancel);

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-[110] flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center"
          onClick={onCancel}
        >
          <motion.div
            ref={panelRef}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            aria-describedby="confirm-body"
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl border border-[var(--color-rule-strong)] bg-[var(--color-ink-2)] p-6 shadow-[0_32px_80px_rgba(0,0,0,0.5)]"
            style={{ marginBottom: "env(safe-area-inset-bottom)" }}
          >
            <h2 id="confirm-title" className="font-serif text-title leading-snug text-[var(--color-bone)]">
              {title}
            </h2>
            <p id="confirm-body" className="mt-2.5 text-body leading-[1.65] text-[var(--color-text-secondary)]">
              {body}
            </p>
            <div className="mt-6 flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={onCancel}
                className={buttonClasses({ variant: "outline", size: "md" })}
              >
                {cancelLabel}
              </button>
              <button
                type="button"
                onClick={onConfirm}
                disabled={loading}
                className={buttonClasses({ variant: tone === "danger" ? "danger" : "primary", size: "md" })}
              >
                {loading ? "Working…" : confirmLabel}
              </button>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
