"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { AppShell } from "@/components/shell/AppShell";
import { EmptyState } from "@/components/ui/EmptyState";
import { buttonClasses } from "@/components/ui/buttonClasses";
import { useSession } from "@/lib/session";
import { PlaybackQueue, base64ToArrayBuffer } from "@/lib/audio/playbackQueue";
import { trackEvent } from "@/lib/analytics";
import { formatRelativeDay, cn } from "@/lib/utils";
import { formatTimeOfDay } from "@/lib/conversations";
import type { ChatTurn } from "@/lib/types";

/**
 * Reading a past conversation, without starting a new one.
 *
 * Revisiting and re-engaging are different intentions. Opening history used to
 * drop straight into the live room with the microphone already armed, so there
 * was no way to sit and re-read what someone said — or hear one line again —
 * without being pulled into talking. This is the quiet half; "Talk again" is
 * the door back into the room.
 */
export function ConversationReader({
  subjectId,
  conversationId,
}: {
  subjectId: string;
  conversationId: string;
}) {
  const router = useRouter();
  const conversations = useSession((s) => s.conversations);
  const openConversation = useSession((s) => s.openConversation);
  const prefs = useSession((s) => s.prefs);

  const conversation = useMemo(
    () => conversations.find((c) => c.id === conversationId) ?? null,
    [conversations, conversationId],
  );

  // Where this sits among the others with the same person, so a reader can
  // move through them without going back to the list each time.
  const { previous, next, position, total } = useMemo(() => {
    const theirs = conversations
      .filter((c) => c.subjectId === subjectId)
      .sort((a, b) => b.updatedAt - a.updatedAt);
    const at = theirs.findIndex((c) => c.id === conversationId);
    return {
      // "Previous" reads as earlier in time, so it is the older one — the
      // opposite of the array order, which is newest first.
      previous: at >= 0 ? (theirs[at + 1] ?? null) : null,
      next: at > 0 ? (theirs[at - 1] ?? null) : null,
      position: at >= 0 ? at + 1 : 0,
      total: theirs.length,
    };
  }, [conversations, subjectId, conversationId]);

  // Without an explicit label the shell derives one from the last path
  // segment, which here is a uuid — the back link read
  // "b6e1b8af f826 45cb 82f8 316c55f5000f".
  const personName = useSession(
    (s) => s.voices.find((v) => v.subjectId === subjectId)?.name ?? null,
  );
  const backLabel = personName ?? "Back";

  const queueRef = useRef<PlaybackQueue | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const queue = new PlaybackQueue({
      onActivityChange: (active) => {
        if (!active) setPlayingId(null);
      },
    });
    queue.setRate(prefs.playbackRate);
    queueRef.current = queue;
    return () => {
      queue.destroy();
      queueRef.current = null;
    };
  }, [prefs.playbackRate]);

  // Audio is never persisted, so a saved reply is spoken again from its text.
  const speak = useCallback(
    async (turn: ChatTurn) => {
      const voiceId = conversation?.voiceId || useSession.getState().voiceId;
      if (!voiceId || !turn.content.trim()) return;
      setNotice(null);
      setPlayingId(turn.id);
      try {
        await queueRef.current?.unlock();
        queueRef.current?.stop();
        if (turn.audio?.length) {
          for (const clip of [...turn.audio].sort((a, b) => a.sentenceIndex - b.sentenceIndex)) {
            await queueRef.current?.enqueue(base64ToArrayBuffer(clip.base64), clip.pauseMs ?? 0);
          }
          trackEvent("reader_line_played", { source: "memory" });
          return;
        }
        const res = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ voiceId, text: turn.content }),
        });
        if (!res.ok) {
          setNotice("Couldn't bring their voice back for that line — try again in a moment.");
          setPlayingId(null);
          return;
        }
        await queueRef.current?.enqueue(await res.arrayBuffer(), 0);
        trackEvent("reader_line_played", { source: "resynth" });
      } catch {
        setNotice("Couldn't bring their voice back for that line — try again in a moment.");
        setPlayingId(null);
      }
    },
    [conversation],
  );

  const talkAgain = () => {
    openConversation(conversationId);
    trackEvent("reader_talk_again");
    router.push(`/people/${subjectId}/talk`);
  };

  if (!conversation) {
    return (
      <AppShell title="Conversation" backHref={`/people/${subjectId}`} backLabel={backLabel} showTabs={false}>
        <div className="mx-auto w-full max-w-2xl px-6 py-16">
          <EmptyState
            variant="conversations"
            title="That conversation isn't here"
            body="It may have been deleted, or it belongs to a different person."
          />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Reading" backHref={`/people/${subjectId}`} backLabel={backLabel} showTabs={false}>
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-6 pb-32 pt-8 sm:px-8">
        <header className="flex flex-col gap-1.5 pb-6">
          <h1 className="font-serif text-display leading-tight tracking-[-0.02em] text-balance text-[var(--color-bone)]">
            {conversation.title}
          </h1>
          <p className="text-small text-[var(--color-text-tertiary)]">
            {formatRelativeDay(conversation.updatedAt)} · {formatTimeOfDay(conversation.updatedAt)}
          </p>
        </header>

        {notice ? (
          <p role="status" className="pb-4 text-small text-[var(--color-bone-dim)]">
            {notice}
          </p>
        ) : null}

        <div className="flex flex-col gap-5">
          {conversation.turns.map((turn, i) => {
            const isUser = turn.role === "user";
            // A long conversation has gaps in it — someone stepped away, came
            // back an hour later. Without a marker the transcript reads as one
            // unbroken sitting, which is not what happened.
            const previousTurn = conversation.turns[i - 1];
            const gapMs = previousTurn ? turn.createdAt - previousTurn.createdAt : 0;
            const showGap = gapMs > 10 * 60 * 1000;
            if (turn.undecryptable) {
              return (
                <p
                  key={turn.id}
                  className="text-small italic text-[var(--color-text-tertiary)]"
                >
                  One line here couldn&rsquo;t be read back.
                </p>
              );
            }
            return (
              <motion.div
                key={turn.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                className={cn("flex flex-col gap-2", isUser ? "items-end" : "items-start")}
              >
                {showGap ? (
                  <span className="w-full py-2 text-center text-micro tracking-[0.14em] text-[var(--color-text-tertiary)] uppercase">
                    {formatTimeOfDay(turn.createdAt)}
                  </span>
                ) : null}
                <div
                  className={cn(
                    "max-w-[88%] rounded-2xl text-pretty sm:max-w-[80%]",
                    isUser
                      ? "hairline rounded-tr-sm bg-white/[0.04] px-5 py-3.5 text-body leading-[1.6] text-[var(--color-bone)]/85"
                      : "font-serif text-lead leading-[1.55] text-[var(--color-bone)] sm:text-title",
                  )}
                >
                  {turn.content}
                </div>
                {!isUser && turn.content.trim() ? (
                  <button
                    type="button"
                    onClick={() => void speak(turn)}
                    disabled={playingId === turn.id}
                    className="flex h-11 cursor-pointer items-center gap-1.5 rounded-full px-2 text-small text-[var(--color-bone-dim)]/70 transition hover:text-[var(--color-ember)] disabled:cursor-default"
                    aria-label="Hear this line in their voice"
                  >
                    {playingId === turn.id ? (
                      <span className="h-3 w-3 animate-spin rounded-full border-2 border-[var(--color-ember)]/30 border-t-[var(--color-ember)]" />
                    ) : (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    )}
                    Hear this
                  </button>
                ) : null}
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* The one way back into the room, always reachable. */}
      <div
        className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--color-rule)] bg-[var(--color-ink-2)]/95 backdrop-blur-xl"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="mx-auto flex w-full max-w-2xl items-center justify-between gap-4 px-6 py-3 sm:px-8">
          {/* Move between conversations without going back to the list each
              time — the natural thing to want when reading back through. */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() =>
                previous && router.push(`/people/${subjectId}/conversations/${previous.id}`)
              }
              disabled={!previous}
              aria-label="Earlier conversation"
              className="flex h-11 w-10 cursor-pointer items-center justify-center rounded-lg text-[var(--color-text-tertiary)] transition hover:text-[var(--color-bone)] disabled:cursor-default disabled:opacity-30"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M15 6l-6 6 6 6" />
              </svg>
            </button>
            <span className="min-w-[3.5rem] text-center text-micro text-[var(--color-text-tertiary)]">
              {total > 1 ? `${position} of ${total}` : ""}
            </span>
            <button
              type="button"
              onClick={() => next && router.push(`/people/${subjectId}/conversations/${next.id}`)}
              disabled={!next}
              aria-label="Later conversation"
              className="flex h-11 w-10 cursor-pointer items-center justify-center rounded-lg text-[var(--color-text-tertiary)] transition hover:text-[var(--color-bone)] disabled:cursor-default disabled:opacity-30"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M9 6l6 6-6 6" />
              </svg>
            </button>
          </div>
          <button type="button" onClick={talkAgain} className={buttonClasses({ size: "md" })}>
            Talk again
          </button>
        </div>
      </div>
    </AppShell>
  );
}
