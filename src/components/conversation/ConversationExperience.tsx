"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { useSession } from "@/lib/session";
import { streamChat } from "@/lib/streamChat";
import { PlaybackQueue, base64ToArrayBuffer } from "@/lib/audio/playbackQueue";
import { Mark } from "@/components/shell/Mark";
import { Composer } from "./Composer";
import { Message } from "./Message";
import { trackEvent } from "@/lib/analytics";
import { reportError } from "@/lib/reportError";
import type { ChatTurn } from "@/lib/types";

const CHAT_CONTEXT_TURNS = 12;
const MEMORY_CONTEXT_LIMIT = 10;

export function ConversationExperience() {
  const router = useRouter();
  const voiceId = useSession((s) => s.voiceId);
  const persona = useSession((s) => s.persona);
  const turns = useSession((s) => s.turns);
  const conversations = useSession((s) => s.conversations);
  const currentConversationId = useSession((s) => s.currentConversationId);
  const memories = useSession((s) => s.memories);
  const status = useSession((s) => s.status);
  const setStatus = useSession((s) => s.setStatus);
  const appendTurn = useSession((s) => s.appendTurn);
  const appendAssistantToken = useSession((s) => s.appendAssistantToken);
  const appendAssistantAudio = useSession((s) => s.appendAssistantAudio);
  const setTurnFeedback = useSession((s) => s.setTurnFeedback);
  const openConversation = useSession((s) => s.openConversation);
  const deleteConversation = useSession((s) => s.deleteConversation);
  const toggleConversationPin = useSession((s) => s.toggleConversationPin);
  const resetConversation = useSession((s) => s.resetConversation);
  const resetAll = useSession((s) => s.resetAll);

  const [amplitude, setAmplitude] = useState(0);
  const [hasUnlocked, setHasUnlocked] = useState(false);
  const [streamingTurnId, setStreamingTurnId] = useState<string | null>(null);
  const [responseError, setResponseError] = useState<string | null>(null);
  const [responseNotice, setResponseNotice] = useState<string | null>(null);
  const [showTranscript, setShowTranscript] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [hasBegun, setHasBegun] = useState(false);
  const opened = hasBegun || turns.length > 0;
  const queueRef = useRef<PlaybackQueue | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const openingRef = useRef(false);
  const lastAmpRef = useRef(0);

  useEffect(() => {
    if (!voiceId) router.replace("/record");
  }, [voiceId, router]);

  useEffect(() => {
    const queue = new PlaybackQueue({
      // Throttle re-renders so we don't setState on every animation frame at
      // idle, while still keeping enough resolution for the orb / visualizer
      // to feel reactive while the persona is speaking.
      onAmplitude: (rms) => {
        if (Math.abs(rms - lastAmpRef.current) < 0.004) return;
        lastAmpRef.current = rms;
        setAmplitude(rms);
      },
      onActivityChange: (active) => {
        if (active) setStatus("speaking");
        else setStatus("idle");
      },
    });
    queueRef.current = queue;
    return () => {
      queue.destroy();
      queueRef.current = null;
    };
  }, [setStatus]);

  const headerSubtitle = useMemo(() => {
    if (persona.mode === "persona") {
      return persona.relationship?.trim() || "A voice you carry";
    }
    return "A clone of the voice you just made";
  }, [persona]);

  const headerName = useMemo(() => {
    return persona.name?.trim() || "Untitled voice";
  }, [persona]);

  const runChatStream = useCallback(
    async (messages: Array<{ role: "user" | "assistant"; content: string }>) => {
      if (!voiceId) return;

      abortRef.current?.abort();
      queueRef.current?.stop();
      setStatus("thinking");
      setResponseError(null);
      setResponseNotice(null);
      const requestStartedAt = performance.now();
      trackEvent("conversation_reply_started", {
        turnCount: messages.length,
        sentTurnCount: Math.min(messages.length, CHAT_CONTEXT_TURNS),
      });

      const controller = new AbortController();
      abortRef.current = controller;
      let timedOut = false;
      const timeout = window.setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, 45_000);

      let assistantId: string | null = null;
      let receivedAudio = false;
      let streamError: string | null = null;
      let textReceived = false;
      let firstAudioEnqueued = false;
      try {
        for await (const event of streamChat(
          {
            voiceId,
            persona,
            messages: messages.slice(-CHAT_CONTEXT_TURNS),
            memories: [...memories]
              .sort((a, b) => b.updatedAt - a.updatedAt)
              .slice(0, MEMORY_CONTEXT_LIMIT)
              .map((memory) => ({ content: memory.content })),
          },
          controller.signal,
        )) {
          if (event.type === "text") {
            textReceived = true;
            if (!assistantId) {
              assistantId = event.turnId;
              setStreamingTurnId(event.turnId);
            }
            appendAssistantToken(event.turnId, event.delta);
          } else if (event.type === "audio") {
            receivedAudio = true;
            appendAssistantAudio(event.turnId, {
              sentenceIndex: event.sentenceIndex,
              mime: event.mime,
              base64: event.base64,
              pauseMs: event.pauseMs,
            });
            try {
              const buf = base64ToArrayBuffer(event.base64);
              await queueRef.current?.enqueue(buf, event.pauseMs ?? 0);
              if (!firstAudioEnqueued) {
                firstAudioEnqueued = true;
                trackEvent("conversation_latency_timing", {
                  label: "client_first_audio_enqueued",
                  elapsedMs: Math.round(performance.now() - requestStartedAt),
                });
              }
            } catch {
              // ignore one-off decode error
            }
          } else if (event.type === "timing") {
            trackEvent("conversation_latency_timing", {
              label: event.label,
              elapsedMs: event.elapsedMs,
            });
          } else if (event.type === "done") {
            setStreamingTurnId(null);
            if (!receivedAudio) {
              setStatus("idle");
              if (textReceived) {
                setResponseNotice("Text reply shown. Voice audio was not returned for this turn.");
              }
            }
          } else if (event.type === "notice") {
            setResponseNotice(event.message);
          } else if (event.type === "error") {
            streamError = event.message;
            setResponseError(event.message || "The reply failed. Tap retry.");
            setStreamingTurnId(null);
          }
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          console.warn("streamChat failed:", err);
          reportError("conversation-stream", err);
        }
        if (timedOut) {
          setResponseError("The response is taking too long. Tap retry.");
          trackEvent("conversation_reply_timeout");
        } else if ((err as Error).name !== "AbortError") {
          setResponseError("Something went wrong. Tap retry.");
          trackEvent("conversation_reply_failed", { reason: "network" });
        }
        setStreamingTurnId(null);
        setStatus("idle");
      } finally {
        window.clearTimeout(timeout);
        abortRef.current = null;
        if (streamError) setStatus("idle");
      }
    },
    [voiceId, persona, memories, appendAssistantToken, appendAssistantAudio, setStatus],
  );

  const ensureUnlocked = useCallback(async () => {
    if (hasUnlocked) return;
    try {
      await queueRef.current?.unlock();
    } catch {
      // continue; the orb will simply have nothing to react to
    }
    setHasUnlocked(true);
  }, [hasUnlocked]);

  const send = useCallback(
    async (text: string) => {
      if (!voiceId) return;
      await ensureUnlocked();

      const userTurn: ChatTurn = {
        id: `u_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
        role: "user",
        content: text,
        createdAt: Date.now(),
      };
      appendTurn(userTurn);
      setResponseError(null);
      trackEvent("conversation_user_turn_sent", { mode: "text_or_voice" });

      const conversation = [...turns, userTurn].map((t) => ({
        role: t.role,
        content: t.content,
      }));

      await runChatStream(conversation);
    },
    [voiceId, turns, appendTurn, ensureUnlocked, runChatStream],
  );

  const openSession = useCallback(async () => {
    if (!voiceId) return;
    if (openingRef.current) return;
    openingRef.current = true;
    setHasBegun(true);

    await ensureUnlocked();
    trackEvent("conversation_opened");

    const opener = {
      role: "user" as const,
      content:
        "(The session has just opened — they are here, listening. Greet them now in your own voice. One or two short sentences, warm and specific to who you are. Do not ask anything yet — just speak first, the way you would when someone you've missed walks back into the room.)",
    };

    await runChatStream([opener]);
  }, [voiceId, ensureUnlocked, runChatStream]);

  const transcribe = useCallback(
    async (audio: Blob, mimeType: string): Promise<string | null> => {
      setStatus("transcribing");
      try {
        const ext = mimeType.includes("mp4")
          ? "mp4"
          : mimeType.includes("mpeg")
            ? "mp3"
            : "webm";
        const file = new File([audio], `speech.${ext}`, { type: mimeType });
        const fd = new FormData();
        fd.append("audio", file);
        const res = await fetch("/api/transcribe", { method: "POST", body: fd });
        if (!res.ok) {
          const json = (await res.json().catch(() => null)) as { error?: string } | null;
          setResponseError(json?.error || "Could not transcribe that audio. Try again or type it.");
          trackEvent("conversation_transcription_failed", { status: res.status });
          return null;
        }
        const json = (await res.json()) as { text?: string };
        return (json.text ?? "").trim() || null;
      } catch {
        setResponseError("Could not transcribe that audio. Try again or type it.");
        trackEvent("conversation_transcription_failed", { status: "network" });
        return null;
      } finally {
        setStatus("idle");
      }
    },
    [setStatus],
  );

  const handleSpeechState = useCallback(
    (state: "idle" | "recording" | "transcribing") => {
      if (state === "transcribing") setStatus("transcribing");
      else if (state === "recording") setStatus("idle");
    },
    [setStatus],
  );

  const restart = useCallback(() => {
    abortRef.current?.abort();
    queueRef.current?.stop();
    setResponseError(null);
    setResponseNotice(null);
    resetConversation();
    trackEvent("conversation_new_chat");
  }, [resetConversation]);

  const retryLast = useCallback(async () => {
    const lastUser = [...turns].reverse().find((turn) => turn.role === "user");
    if (!lastUser) return;
    setResponseError(null);
    await runChatStream(
      turns
        .filter((turn) => turn.createdAt <= lastUser.createdAt)
        .map((turn) => ({ role: turn.role, content: turn.content })),
    );
  }, [turns, runChatStream]);

  const startOver = useCallback(() => {
    abortRef.current?.abort();
    queueRef.current?.stop();
    resetAll();
    router.push("/");
  }, [resetAll, router]);

  const interrupt = useCallback(() => {
    abortRef.current?.abort();
    queueRef.current?.stop();
    setStreamingTurnId(null);
    setStatus("idle");
    setResponseNotice("Stopped. You can speak or type again.");
    trackEvent("conversation_interrupted", { status });
  }, [setStatus, status]);

  const replayTurn = useCallback(
    async (turn: ChatTurn) => {
      if (!turn.audio?.length) return;
      await ensureUnlocked();
      queueRef.current?.stop();
      setResponseError(null);
      setResponseNotice(null);
      trackEvent("conversation_reply_replayed", { chunks: turn.audio.length });
      for (const item of [...turn.audio].sort((a, b) => a.sentenceIndex - b.sentenceIndex)) {
        try {
          await queueRef.current?.enqueue(base64ToArrayBuffer(item.base64), item.pauseMs ?? 0);
        } catch {
          setResponseNotice("One saved audio segment could not be replayed.");
        }
      }
    },
    [ensureUnlocked],
  );

  if (!voiceId) return null;

  // The "spotlight" message: the latest turn shown above the orb. Streaming
  // assistant turns show with a typewriter cursor; user turns appear briefly
  // after they're transcribed and are then replaced by the assistant's reply.
  const latestTurn: ChatTurn | undefined = turns[turns.length - 1];

  return (
    <div
      className="relative flex flex-col"
      style={{ minHeight: "100dvh" }}
    >
      <header className="relative z-20">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-5 sm:px-8 sm:py-6">
          <Link href="/" aria-label="Home" className="-mx-1 px-1">
            <Mark />
          </Link>
          <div className="hidden flex-col items-center text-center sm:flex">
            <span className="font-serif text-[15px] tracking-[-0.005em] text-[var(--color-bone)]">
              {headerName}
            </span>
            <span className="text-[11px] tracking-[0.04em] text-[var(--color-bone-dim)]">
              {headerSubtitle}
            </span>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2 text-[12px]">
            <button
              type="button"
              onClick={restart}
              className="text-[var(--color-bone-dim)] transition hover:text-[var(--color-bone)]"
            >
              New chat
            </button>
            <Link
              href="/memories"
              className="text-[var(--color-bone-dim)] transition hover:text-[var(--color-bone)]"
            >
              Memory
            </Link>
            <button
              type="button"
              onClick={() => setShowHistory((open) => !open)}
              className="text-[var(--color-bone-dim)] transition hover:text-[var(--color-bone)]"
            >
              History
            </button>
            <button
              type="button"
              onClick={() => router.push("/persona")}
              className="text-[var(--color-bone-dim)] transition hover:text-[var(--color-bone)]"
            >
              Change persona
            </button>
            <button
              type="button"
              onClick={() => setShowTranscript((open) => !open)}
              className="text-[var(--color-bone-dim)] transition hover:text-[var(--color-bone)]"
            >
              Transcript
            </button>
            <span className="hidden h-3 w-px bg-[var(--color-rule-strong)] sm:block" />
            <button
              type="button"
              onClick={startOver}
              className="text-[var(--color-bone-dim)] transition hover:text-[var(--color-bone)]"
            >
              New voice
            </button>
          </div>
        </div>
      </header>

      <main
        className="relative flex flex-1 flex-col items-center justify-center px-6 sm:px-8"
        style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}
      >
        {/* Mobile-only persona name — stacks above the spotlight on narrow screens. */}
        <div className="flex flex-col items-center text-center sm:hidden mb-4">
          <span className="font-serif text-[18px] tracking-[-0.005em] text-[var(--color-bone)]">
            {headerName}
          </span>
          <span className="text-[11px] tracking-[0.04em] text-[var(--color-bone-dim)]">
            {headerSubtitle}
          </span>
        </div>

        {/* Spotlight: ONE message at a time, fading from one to the next. */}
        <div className="flex min-h-[6.5rem] w-full max-w-2xl items-end justify-center sm:min-h-[7.5rem]">
          <AnimatePresence mode="wait">
            {opened && latestTurn ? (
              <motion.p
                key={latestTurn.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                className={
                  latestTurn.role === "assistant"
                    ? "font-serif text-balance text-[22px] leading-[1.45] text-[var(--color-bone)] sm:text-[28px]"
                    : "text-balance text-[15px] leading-[1.55] text-[var(--color-bone-dim)] italic sm:text-[17px]"
                }
              >
                {latestTurn.role === "user" ? "“" : null}
                {latestTurn.content}
                {latestTurn.role === "user" ? "”" : null}
                {latestTurn.id === streamingTurnId && latestTurn.role === "assistant" ? (
                  <span
                    aria-hidden
                    className="ml-1 inline-block h-[0.85em] w-[3px] translate-y-[2px] animate-pulse rounded-sm bg-[var(--color-ember)]/85 align-middle"
                  />
                ) : null}
              </motion.p>
            ) : opened ? (
              <motion.p
                key="awaiting-greet"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.6, delay: 0.2 }}
                className="text-center text-[14px] text-[var(--color-bone-dim)]"
              >
                A breath, and they speak.
              </motion.p>
            ) : null}
          </AnimatePresence>
        </div>

        {/* Centerpiece + composer */}
        <div className="mt-10 flex w-full max-w-2xl flex-col items-center sm:mt-14">
          {status === "speaking" || status === "thinking" ? (
            <button
              type="button"
              onClick={interrupt}
              className="mb-4 rounded-full border border-[var(--color-rule-strong)] px-4 py-2 text-[12px] text-[var(--color-bone)]/85 transition hover:border-[var(--color-ember)]/40"
            >
              Interrupt
            </button>
          ) : null}
          {responseError ? (
            <div className="mb-5 flex flex-col items-center gap-3 text-center">
              <p className="text-[13px] text-[var(--color-ember-soft)]">
                {responseError}
              </p>
              <button
                type="button"
                onClick={() => void retryLast()}
                className="rounded-full border border-[var(--color-rule-strong)] px-4 py-2 text-[12px] text-[var(--color-bone)]/85 transition hover:border-[var(--color-ember)]/40"
              >
                Retry reply
              </button>
            </div>
          ) : null}
          {responseNotice ? (
            <p className="mb-5 max-w-md text-center text-[12px] leading-[1.6] text-[var(--color-bone-dim)]">
              {responseNotice}
            </p>
          ) : null}
          {opened ? (
            <Composer
              disabled={status === "thinking"}
              personaBusy={status === "thinking" || status === "speaking"}
              playbackAmplitude={amplitude}
              onSend={(t) => void send(t)}
              onTranscribe={transcribe}
              onSpeechStateChange={handleSpeechState}
              onActivate={ensureUnlocked}
            />
          ) : (
            <BeginGate onBegin={() => void openSession()} />
          )}
        </div>

        {showTranscript ? (
          <Transcript
            turns={turns}
            streamingTurnId={streamingTurnId}
            onReplay={(turn) => void replayTurn(turn)}
            onFeedback={(turnId, feedback) => {
              setTurnFeedback(turnId, feedback);
              trackEvent("conversation_turn_feedback", { feedback });
            }}
          />
        ) : null}

        <HistoryDrawer
          open={showHistory}
          conversations={conversations}
          currentConversationId={currentConversationId}
          onClose={() => setShowHistory(false)}
          onOpen={(id) => {
            openConversation(id);
            setShowHistory(false);
            setHasBegun(true);
          }}
          onNew={() => {
            restart();
            setShowHistory(false);
            setHasBegun(false);
          }}
          onPin={toggleConversationPin}
          onDelete={deleteConversation}
        />
      </main>
    </div>
  );
}

function HistoryDrawer({
  open,
  conversations,
  currentConversationId,
  onClose,
  onOpen,
  onNew,
  onPin,
  onDelete,
}: {
  open: boolean;
  conversations: ReturnType<typeof useSession.getState>["conversations"];
  currentConversationId: string | null;
  onClose: () => void;
  onOpen: (id: string) => void;
  onNew: () => void;
  onPin: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <AnimatePresence>
      {open ? (
        <motion.aside
          initial={{ opacity: 0, x: 18 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 18 }}
          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          className="hairline fixed right-4 bottom-4 z-40 max-h-[72dvh] w-[min(360px,calc(100vw-2rem))] overflow-hidden rounded-2xl bg-[var(--color-ink)]/95 shadow-2xl backdrop-blur-xl"
        >
          <div className="flex items-center justify-between border-b border-[var(--color-rule)] px-4 py-3">
            <p className="text-[12px] tracking-[0.18em] text-[var(--color-bone-dim)] uppercase">
              History
            </p>
            <button
              type="button"
              onClick={onClose}
              className="text-[12px] text-[var(--color-bone-dim)] transition hover:text-[var(--color-bone)]"
            >
              Close
            </button>
          </div>
          <div className="max-h-[calc(72dvh-4rem)] overflow-y-auto p-3">
            <button
              type="button"
              onClick={onNew}
              className="mb-3 w-full rounded-xl border border-[var(--color-rule-strong)] px-3 py-2 text-left text-[13px] text-[var(--color-bone)]/82 transition hover:border-[var(--color-ember)]/35"
            >
              Start new chat
            </button>
            {conversations.length ? (
              <div className="space-y-2">
                {conversations.map((conversation) => (
                  <section
                    key={conversation.id}
                    className="rounded-xl bg-white/[0.025] p-3"
                  >
                    <button
                      type="button"
                      onClick={() => onOpen(conversation.id)}
                      className="block w-full text-left"
                    >
                      <span className="block truncate font-serif text-[18px] text-[var(--color-bone)]">
                        {conversation.pinned ? "Pinned · " : ""}
                        {conversation.title}
                      </span>
                      <span className="mt-1 block text-[11px] text-[var(--color-bone-dim)]">
                        {conversation.turns.length} turns ·{" "}
                        {new Date(conversation.updatedAt).toLocaleDateString()}
                        {conversation.id === currentConversationId ? " · Current" : ""}
                      </span>
                    </button>
                    <div className="mt-3 flex gap-3 text-[11px]">
                      <button
                        type="button"
                        onClick={() => onPin(conversation.id)}
                        className="text-[var(--color-bone-dim)] transition hover:text-[var(--color-bone)]"
                      >
                        {conversation.pinned ? "Unpin" : "Pin"}
                      </button>
                      <button
                        type="button"
                        onClick={() => onDelete(conversation.id)}
                        className="text-[var(--color-bone-dim)] transition hover:text-[var(--color-bone)]"
                      >
                        Delete
                      </button>
                    </div>
                  </section>
                ))}
              </div>
            ) : (
              <p className="px-1 py-3 text-[13px] text-[var(--color-bone-dim)]">
                No saved conversations on this device yet.
              </p>
            )}
            <Link
              href="/conversations"
              className="mt-4 block text-[12px] text-[var(--color-bone-dim)] transition hover:text-[var(--color-bone)]"
            >
              Open full history
            </Link>
          </div>
        </motion.aside>
      ) : null}
    </AnimatePresence>
  );
}

function Transcript({
  turns,
  streamingTurnId,
  onFeedback,
  onReplay,
}: {
  turns: ChatTurn[];
  streamingTurnId: string | null;
  onFeedback: (turnId: string, feedback: NonNullable<ChatTurn["feedback"]>) => void;
  onReplay: (turn: ChatTurn) => void;
}) {
  return (
    <section className="mt-8 w-full max-w-3xl pb-8">
      <div className="hairline max-h-[42dvh] overflow-y-auto rounded-2xl bg-white/[0.018] p-4 sm:p-5">
        {turns.length ? (
          <div className="space-y-3">
            {turns.map((turn) => (
              <Message
                key={turn.id}
                turn={turn}
                streaming={turn.id === streamingTurnId}
                onReplay={
                  turn.role === "assistant" && turn.audio?.length
                    ? () => onReplay(turn)
                    : undefined
                }
                onFeedback={
                  turn.role === "assistant"
                    ? (feedback) => onFeedback(turn.id, feedback)
                    : undefined
                }
              />
            ))}
          </div>
        ) : (
          <p className="text-[13px] text-[var(--color-bone-dim)]">
            The transcript will appear here once the conversation starts.
          </p>
        )}
      </div>
    </section>
  );
}

function BeginGate({ onBegin }: { onBegin: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      className="flex flex-col items-center gap-3"
    >
      <button
        type="button"
        onClick={onBegin}
        className="hairline-strong group inline-flex items-center gap-3 rounded-full bg-[var(--color-ink-2)]/85 px-7 py-4 text-[15px] text-[var(--color-bone)] backdrop-blur-xl transition-[transform,background] duration-300 hover:bg-[var(--color-ink-2)] active:scale-[0.99]"
      >
        <span className="relative grid h-2.5 w-2.5 place-items-center">
          <span className="absolute inset-0 animate-ping rounded-full bg-[var(--color-ember)]/50" />
          <span className="relative h-2 w-2 rounded-full bg-[var(--color-ember)]" />
        </span>
        Tap to begin
      </button>
      <p className="text-[11px] tracking-[0.18em] text-[var(--color-bone-dim)]/70 uppercase">
        They will speak first
      </p>
    </motion.div>
  );
}
