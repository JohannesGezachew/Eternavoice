"use client";

import { motion } from "framer-motion";
import type { ChatTurn } from "@/lib/types";
import { cn } from "@/lib/utils";

export function Message({
  turn,
  streaming,
  onReplay,
  onFeedback,
  onSaveClip,
  onRemember,
}: {
  turn: ChatTurn;
  streaming?: boolean;
  onReplay?: () => void;
  onFeedback?: (feedback: NonNullable<ChatTurn["feedback"]>) => void;
  /** Download this reply's audio as a keepsake. */
  onSaveClip?: () => void;
  /** Save this (user) turn as a memory the persona carries forward. */
  onRemember?: () => void;
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
          <div className="space-y-2">
            <p className="text-[15px] leading-[1.6]">{turn.content}</p>
            {onRemember ? (
              <button
                type="button"
                onClick={onRemember}
                className="rounded-full border border-[var(--color-rule-strong)] px-2.5 py-1 text-[11px] text-[var(--color-bone-dim)] transition hover:border-[var(--color-ember)]/40 hover:text-[var(--color-bone)]"
              >
                Remember this
              </button>
            ) : null}
          </div>
        ) : (
          <div className="space-y-3">
            <p>
              {turn.content || (streaming ? "" : "")}
              {streaming ? (
                <span className="ml-1 inline-block h-[0.9em] w-[0.18em] -translate-y-[0.05em] animate-pulse bg-[var(--color-ember)] align-middle" />
              ) : null}
            </p>
            {!streaming && (onReplay || onSaveClip || onFeedback) ? (
              <div className="flex flex-col gap-2.5 font-sans text-[11px]">
                {/* Voice actions — hearing & keeping the voice. Kept distinct
                    from the calibration feedback below. */}
                {onReplay || onSaveClip ? (
                  <div className="flex flex-wrap items-center gap-2">
                    {onReplay ? (
                      <button
                        type="button"
                        onClick={onReplay}
                        className="flex items-center gap-1.5 rounded-full border border-[var(--color-ember)]/40 bg-[var(--color-ember)]/[0.07] px-3 py-1 text-[var(--color-bone)] transition hover:bg-[var(--color-ember)]/[0.14]"
                      >
                        <PlayIcon />
                        Replay voice
                      </button>
                    ) : null}
                    {onSaveClip ? (
                      <button
                        type="button"
                        onClick={onSaveClip}
                        className="flex items-center gap-1.5 rounded-full border border-[var(--color-rule-strong)] px-3 py-1 text-[var(--color-bone-dim)] transition hover:text-[var(--color-bone)]"
                      >
                        <DownloadIcon />
                        Save clip
                      </button>
                    ) : null}
                  </div>
                ) : null}

                {/* Calibration feedback — tunes future replies. */}
                {onFeedback ? (
                  <div className="flex flex-wrap items-center gap-2 border-t border-[var(--color-rule)]/60 pt-2.5">
                    <span className="text-[10px] tracking-[0.12em] text-[var(--color-bone-dim)]/45 uppercase">
                      Feedback
                    </span>
                    {[
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
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        )}
      </div>
    </motion.div>
  );
}

function PlayIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 3v12m0 0l-4-4m4 4l4-4" />
      <path d="M5 21h14" />
    </svg>
  );
}
