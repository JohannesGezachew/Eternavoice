"use client";

import { motion } from "framer-motion";
import type { ChatTurn } from "@/lib/types";
import { cn } from "@/lib/utils";

export function Message({
  turn,
  streaming,
}: {
  turn: ChatTurn;
  streaming?: boolean;
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
          <p>
            {turn.content || (streaming ? "" : "")}
            {streaming ? (
              <span className="ml-1 inline-block h-[0.9em] w-[0.18em] -translate-y-[0.05em] animate-pulse bg-[var(--color-ember)] align-middle" />
            ) : null}
          </p>
        )}
      </div>
    </motion.div>
  );
}
