"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

const MESSAGES = [
  { role: "user", text: "Dad, I've been thinking about you a lot lately." },
  { role: "ai",   text: "I'm here. Tell me what's on your mind — I've got time." },
  { role: "user", text: "I just wanted to hear your voice again." },
  { role: "ai",   text: "Well, here I am. I'm not going anywhere." },
] as const;

const REVEAL_INTERVAL = 1100;
const TYPING_DURATION = 750;
const LOOP_PAUSE = 3200;

export function ConversationDemo() {
  const [visible, setVisible] = useState(2);

  // The "typing" indicator is derived: it shows while the next message to
  // reveal is the persona's. The effect only schedules the reveal.
  const next = visible < MESSAGES.length ? MESSAGES[visible] : null;
  const typing = next?.role === "ai";

  useEffect(() => {
    if (visible >= MESSAGES.length) {
      const timer = setTimeout(() => setVisible(1), LOOP_PAUSE);
      return () => clearTimeout(timer);
    }
    const upcoming = MESSAGES[visible];
    if (!upcoming) return;
    const delay = upcoming.role === "ai" ? TYPING_DURATION : REVEAL_INTERVAL;
    const t = setTimeout(() => setVisible((v) => v + 1), delay);
    return () => clearTimeout(t);
  }, [visible]);

  // Only ever show the last two messages, sliding like a live chat. Keeping a
  // fixed window (rather than accumulating 1→4) means the card's height never
  // changes, so nothing below it on the page shifts as the demo loops.
  const WINDOW = 2;
  const windowStart = Math.max(0, visible - WINDOW);
  const shownMessages = MESSAGES.slice(windowStart, visible).map((msg, i) => ({
    ...msg,
    idx: windowStart + i,
  }));
  const lastIsAi = shownMessages.length > 0 && shownMessages[shownMessages.length - 1]?.role === "ai";

  return (
    <div
      className="w-full overflow-hidden rounded-2xl border border-[var(--color-rule-strong)]"
      style={{
        background: "linear-gradient(160deg, rgba(255,255,255,0.022) 0%, rgba(255,255,255,0.008) 100%)",
        boxShadow: "0 0 0 1px rgba(194,120,74,0.07) inset, 0 24px 48px rgba(0,0,0,0.4)",
      }}
    >
      {/* Header bar */}
      <div className="flex items-center justify-between border-b border-[var(--color-rule)] px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <div
            className="h-6 w-6 rounded-full"
            style={{ background: "radial-gradient(closest-side, rgba(194,120,74,0.8), rgba(194,120,74,0.2))" }}
            aria-hidden
          />
          <span className="text-[12px] tracking-[0.06em] text-[var(--color-bone-dim)]">
            Dad <span className="opacity-40">·</span> His voice
          </span>
        </div>
        <span className="flex items-center gap-1.5 rounded-full border border-[var(--color-rule-strong)] bg-white/[0.025] px-2.5 py-0.5 text-[10px] tracking-[0.14em] text-[var(--color-bone-dim)]/80 uppercase">
          <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--color-ember)]" aria-hidden />
          Example
        </span>
      </div>

      {/* Messages — fixed height + bottom-anchored so the card never grows or
          shrinks as messages cycle (which would push the page content below). */}
      <div className="flex h-[240px] flex-col justify-end gap-3 overflow-hidden px-5 py-5">
        <AnimatePresence mode="popLayout" initial={false}>
          {shownMessages.map((msg) => (
            <motion.div
              key={msg.idx}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[78%] rounded-2xl px-4 py-2.5 text-[13px] leading-[1.6] ${
                  msg.role === "user"
                    ? "rounded-br-sm border border-white/[0.06] bg-white/[0.07] text-[var(--color-bone)]/90"
                    : "rounded-bl-sm border border-[var(--color-ember)]/15 bg-[var(--color-ember)]/[0.13] text-[var(--color-bone)]/90"
                }`}
              >
                {msg.text}
              </div>
            </motion.div>
          ))}

          {typing && (
            <motion.div
              key="typing"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.22 }}
              className="flex justify-start"
            >
              <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-sm bg-[var(--color-ember)]/[0.08] px-4 py-3">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="h-1.5 w-1.5 rounded-full bg-[var(--color-ember)]/50"
                    style={{ animation: `dotBounce 1.1s ease-in-out ${i * 0.18}s infinite` }}
                  />
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Bottom bar */}
      <div className="flex items-center gap-3 border-t border-[var(--color-rule)] px-5 py-3">
        <div className="flex items-center gap-[3px]" aria-hidden>
          {Array.from({ length: 14 }).map((_, i) => (
            <div
              key={i}
              className="w-[2px] rounded-full bg-[var(--color-ember)]"
              style={{
                height: `${5 + Math.abs(Math.sin(i * 0.85)) * 8}px`,
                opacity: lastIsAi ? 0.55 : 0.14,
                animation: lastIsAi ? `barPulse 0.75s ease-in-out ${i * 0.055}s infinite alternate` : "none",
              }}
            />
          ))}
        </div>
        <span className="text-[11px] tracking-[0.06em] text-[var(--color-bone-dim)]/80">
          {lastIsAi ? "Speaking…" : "Listening"}
        </span>
        <div className="ml-auto text-[10px] tracking-[0.06em] text-[var(--color-bone-dim)]/80">
          End-to-end encrypted
        </div>
      </div>

      <style>{`
        @keyframes barPulse {
          from { transform: scaleY(0.55); opacity: 0.3; }
          to   { transform: scaleY(1.5);  opacity: 0.65; }
        }
        @keyframes dotBounce {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
          40%            { transform: translateY(-4px); opacity: 0.9; }
        }
      `}</style>
    </div>
  );
}
