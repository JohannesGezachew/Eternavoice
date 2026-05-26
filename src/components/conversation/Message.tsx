"use client";

import { motion } from "framer-motion";
import type { ChatTurn } from "@/lib/types";
import { cn } from "@/lib/utils";

export function Message({
  turn,
  streaming,
  onReplay,
  onFeedback,
}: {
  turn: ChatTurn;
  streaming?: boolean;
  onReplay?: () => void;
  onFeedback?: (feedback: NonNullable<ChatTurn["feedback"]>) => void;
}) {
  const isUser = turn.role === "user";
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className={cn(
        "flex w-full",
        isUser ? "justify-end" : "justify-start",
      )}
    >
      <div
        className={cn(
          "max-w-[88%] rounded-2xl px-5 py-4 text-pretty sm:max-w-[78%]",
          isUser
            ? "bg-white/[0.04] text-[var(--color-bone)]/90 hairline rounded-tr-sm"
            : "font-serif rounded-tl-sm bg-transparent text-[20px] leading-[1.55] tracking-[-0.005em] text-[var(--color-bone)] sm:text-[22px]",
        )}
      >
        {isUser ? (
          <p className="text-[15px] leading-[1.6]">{turn.content}</p>
        ) : (
          <div className="space-y-3">
            <p>
              {turn.content || (streaming ? "" : "")}
              {streaming ? (
                <span className="ml-1 inline-block h-[0.9em] w-[0.18em] -translate-y-[0.05em] animate-pulse bg-[var(--color-ember)] align-middle" />
              ) : null}
            </p>
            {!streaming && (onReplay || onFeedback) ? (
              <div className="flex flex-wrap gap-2 font-sans text-[11px]">
                {onReplay ? (
                  <button
                    type="button"
                    onClick={onReplay}
                    className="rounded-full border border-[var(--color-rule-strong)] px-2.5 py-1 text-[var(--color-bone-dim)] transition hover:text-[var(--color-bone)]"
                  >
                    Replay voice
                  </button>
                ) : null}
                {onFeedback ? [
                  ["more-like-this", "More like this"],
                  ["too-ai", "Too AI"],
                  ["too-long", "Too long"],
                  ["wrong-tone", "Wrong tone"],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => onFeedback(value as NonNullable<ChatTurn["feedback"]>)}
                    className={cn(
                      "rounded-full border px-2.5 py-1 transition",
                      turn.feedback === value
                        ? "border-[var(--color-ember)]/50 text-[var(--color-bone)]"
                        : "border-[var(--color-rule-strong)] text-[var(--color-bone-dim)] hover:text-[var(--color-bone)]",
                    )}
                  >
                    {label}
                  </button>
                )) : null}
              </div>
            ) : null}
          </div>
        )}
      </div>
    </motion.div>
  );
}
