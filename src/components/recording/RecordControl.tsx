"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface RecordControlProps {
  state: "idle" | "recording" | "stopping";
  onClick: () => void;
  disabled?: boolean;
  label?: string;
}

export function RecordControl({ state, onClick, disabled, label }: RecordControlProps) {
  const recording = state === "recording";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={recording}
      aria-label={recording ? "Stop recording" : "Start recording"}
      className="group relative flex h-20 w-20 items-center justify-center rounded-full focus-visible:outline-none disabled:opacity-40"
    >
      {recording ? (
        <motion.span
          aria-hidden
          className="absolute inset-[-12px] rounded-full"
          style={{
            background:
              "radial-gradient(closest-side, rgba(194,120,74,0.35), transparent 70%)",
          }}
          animate={{ scale: [1, 1.15, 1] }}
          transition={{ duration: 2.6, ease: [0.16, 1, 0.3, 1], repeat: Infinity }}
        />
      ) : null}

      <span
        className={cn(
          "relative flex h-20 w-20 items-center justify-center rounded-full border transition-[background,border-color,box-shadow] duration-500",
          recording
            ? "border-[var(--color-ember)]/60 bg-[var(--color-ember)]/10 shadow-[0_0_0_1px_rgba(194,120,74,0.2),0_20px_60px_-20px_rgba(194,120,74,0.6)]"
            : "border-[var(--color-rule-strong)] bg-white/[0.03] group-hover:border-[var(--color-ember)]/40 group-hover:bg-white/[0.05]",
        )}
      >
        <span
          className={cn(
            "transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]",
            recording
              ? "h-5 w-5 rounded-[5px] bg-[var(--color-ember)]"
              : "h-7 w-7 rounded-full bg-[var(--color-ember)]",
          )}
        />
      </span>

      {label ? (
        <span className="absolute top-full mt-4 text-[12px] tracking-[0.2em] text-[var(--color-bone-dim)] uppercase">
          {label}
        </span>
      ) : null}
    </button>
  );
}
