"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { useSession } from "@/lib/session";
import { streamChat } from "@/lib/streamChat";
import { PlaybackQueue, base64ToArrayBuffer } from "@/lib/audio/playbackQueue";
import { Composer, VoiceOrb } from "./Composer";
import { VoicePrint } from "@/components/people/VoicePrint";
import { Message } from "./Message";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { trackEvent } from "@/lib/analytics";
import { reportError } from "@/lib/reportError";
import { saveConversation, deleteConversationDb } from "@/lib/db/conversations";
import { addMemoryDb } from "@/lib/db/memories";
import { formatRelativeDay } from "@/lib/utils";
import type { ChatTurn } from "@/lib/types";

const CHAT_CONTEXT_TURNS = 12;
const MEMORY_CONTEXT_LIMIT = 10;

/** Tactile ack on phones — begin, barge-in. Silently no-ops elsewhere. */
function buzz(pattern: number | number[] = 12) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // not supported
  }
}

/** A quiet rising tone as the session opens — the room coming alive. */
function playOpeningTone() {
  try {
    const ctx = new AudioContext();
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(ctx.destination);
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.connect(gain);
    const t0 = ctx.currentTime;
    osc.frequency.setValueAtTime(392, t0); // G4 …
    osc.frequency.linearRampToValueAtTime(523.25, t0 + 0.45); // … rising to C5
    gain.gain.linearRampToValueAtTime(0.04, t0 + 0.18);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.2);
    osc.start(t0);
    osc.stop(t0 + 1.3);
    osc.onended = () => void ctx.close();
  } catch {
    // silence is an acceptable fallback for a chime
  }
}

interface ConversationExperienceProps {
  /** Where "back" leads — the person's hub page. */
  backHref?: string;
}

export function ConversationExperience({ backHref = "/people" }: ConversationExperienceProps) {
  const router = useRouter();
  const voiceId = useSession((s) => s.voiceId);
  const activeSubjectId = useSession((s) => s.activeSubjectId);
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
  const addMemory = useSession((s) => s.addMemory);
  const prefs = useSession((s) => s.prefs);

  const [amplitude, setAmplitude] = useState(0);
  const [hasUnlocked, setHasUnlocked] = useState(false);
  const [streamingTurnId, setStreamingTurnId] = useState<string | null>(null);
  const [responseError, setResponseError] = useState<string | null>(null);
  const [responseNotice, setResponseNotice] = useState<string | null>(null);
  const [showTranscript, setShowTranscript] = useState(() => useSession.getState().prefs.transcriptDefault);
  const [showHistory, setShowHistory] = useState(false);
  const [hasBegun, setHasBegun] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<{ id: string; title: string } | null>(null);
  const opened = hasBegun || turns.length > 0;
  const queueRef = useRef<PlaybackQueue | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const openingRef = useRef(false);
  const lastAmpRef = useRef(0);
  // Set once when the session opens — true only for the very first
  // conversation ever held with this person. State drives the premiere
  // rendering; the ref feeds request payloads inside callbacks (which would
  // otherwise see the pre-update closure on the opening turn).
  const [firstEver, setFirstEver] = useState(false);
  const firstEverRef = useRef(false);

  useEffect(() => {
    // No active voice: land on the people page (its empty state offers the
    // wizard) rather than dropping the user into a form they didn't ask for.
    if (!voiceId) router.replace("/people");
  }, [voiceId, router]);

  // The tab is named after the person, not the app.
  useEffect(() => {
    const name = persona.name?.trim();
    if (name) document.title = `${name} · EternaVoice`;
  }, [persona.name]);

  // One-time hint: barge-in exists but is invisible until someone tells you.
  // Surface it during the first long reply, then never again.
  useEffect(() => {
    if (status !== "speaking") return;
    let flagged = false;
    try {
      flagged = localStorage.getItem("ev-hint-bargein") === "1";
    } catch {
      flagged = true;
    }
    if (flagged) return;
    const t = window.setTimeout(() => {
      setResponseNotice("You can just start talking — they'll stop and listen.");
      try {
        localStorage.setItem("ev-hint-bargein", "1");
      } catch {
        // fine — they'll discover it themselves
      }
    }, 4000);
    return () => window.clearTimeout(t);
  }, [status]);

  // Fire-and-forget summarisation: the conversation is summarised (and its
  // durable facts extracted into memories) whenever the user leaves it — by
  // closing the tab, navigating away, starting a new conversation, or
  // opening a different one. Reads live state through a ref so the beacon
  // always carries the latest turns, not the ones from when the
  // conversation was opened.
  const summariseRef = useRef<() => void>(() => {});
  useEffect(() => {
    summariseRef.current = () => {
      if (!currentConversationId || turns.length < 2) return;
      const payload = JSON.stringify({
        turns: turns.slice(-20).map((t) => ({ role: t.role, content: t.content.slice(0, 800) })),
        subjectId: activeSubjectId ?? undefined,
      });
      navigator.sendBeacon(
        `/api/conversations/${currentConversationId}/summarise`,
        new Blob([payload], { type: "application/json" }),
      );
    };
  });
  useEffect(() => {
    const summarise = () => summariseRef.current();
    window.addEventListener("beforeunload", summarise);
    return () => {
      summarise();
      window.removeEventListener("beforeunload", summarise);
    };
  }, [currentConversationId]);

  // Persist turns to DB after each assistant reply completes (debounced).
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!currentConversationId || !voiceId || turns.length === 0) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const conv = conversations.find((c) => c.id === currentConversationId);
      if (!conv) return;
      void saveConversation({
        ...conv,
        subjectId: conv.subjectId ?? activeSubjectId ?? null,
      }).catch(console.error);
    }, 2000);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turns.length, currentConversationId]);

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
    queue.setRate(useSession.getState().prefs.playbackRate);
    queueRef.current = queue;
    return () => {
      queue.destroy();
      queueRef.current = null;
    };
  }, [setStatus]);

  // Listening preference: their voice at the pace the user chose.
  useEffect(() => {
    queueRef.current?.setRate(prefs.playbackRate);
  }, [prefs.playbackRate]);

  const headerSubtitle = useMemo(() => {
    if (persona.mode === "persona") {
      return persona.relationship?.trim() || "A voice you carry";
    }
    return "Your voice";
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
            // Only this person's memories (plus legacy unscoped ones) — a
            // note about Dad must never surface in Grandma's voice.
            memories: memories
              .filter((m) => m.subjectId == null || m.subjectId === activeSubjectId)
              .sort((a, b) => b.updatedAt - a.updatedAt)
              .slice(0, MEMORY_CONTEXT_LIMIT)
              .map((memory) => ({ content: memory.content })),
            subjectId: activeSubjectId ?? undefined,
            // Remember-together mode for roughly the first two minutes of a
            // first-ever conversation, then it falls away naturally.
            firstMeeting: firstEverRef.current && messages.length < 12,
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
    [voiceId, persona, memories, activeSubjectId, appendAssistantToken, appendAssistantAudio, setStatus],
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
        // Must be a real UUID — turn ids are uuid primary keys in the DB.
        id: crypto.randomUUID(),
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
    // First conversation ever with this person: stage the premiere — the
    // chrome dims until their first words have fully landed — and open in
    // remember-together mode (the persona gathers memory for ~2 minutes).
    const isFirst = conversations.length === 0 && turns.length === 0;
    firstEverRef.current = isFirst;
    setFirstEver(isFirst);
    setHasBegun(true);
    buzz(12);
    playOpeningTone();

    await ensureUnlocked();
    trackEvent("conversation_opened");

    const opener = {
      role: "user" as const,
      content: isFirst
        ? "(The session has just opened — the very first time the two of you speak through here. Greet them in your own voice, one or two short sentences, then gently begin remembering together: ask one small question about your shared life — what they call you, or a moment you both kept.)"
        : "(The session has just opened — they are here, listening. Greet them now in your own voice. One or two short sentences, warm and specific to who you are. Do not ask anything yet — just speak first, the way you would when someone you've missed walks back into the room.)",
    };

    await runChatStream([opener]);
  }, [voiceId, conversations.length, turns.length, ensureUnlocked, runChatStream]);

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
    // Capture the outgoing conversation before the thread resets.
    summariseRef.current();
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

  const interrupt = useCallback(() => {
    abortRef.current?.abort();
    queueRef.current?.stop();
    setStreamingTurnId(null);
    setStatus("idle");
    setResponseNotice("Stopped. You can speak or type again.");
    trackEvent("conversation_interrupted", { status });
  }, [setStatus, status]);

  const bargeIn = useCallback(() => {
    abortRef.current?.abort();
    queueRef.current?.stop();
    setStreamingTurnId(null);
    setStatus("idle");
    setResponseError(null);
    setResponseNotice("Stopped. I'm listening.");
    buzz(8);
    trackEvent("conversation_barge_in", { status });
  }, [setStatus, status]);

  // "She should remember this" — capture a memory at the moment it happens,
  // not later from a settings form.
  const rememberTurn = useCallback(
    (turn: ChatTurn) => {
      addMemory(turn.content, activeSubjectId ?? null);
      void addMemoryDb(turn.content, activeSubjectId ?? undefined).catch(console.error);
      setResponseNotice("Saved — they'll carry that into every conversation.");
      trackEvent("memory_added_from_talk");
    },
    [addMemory, activeSubjectId],
  );

  // Keepsake: a reply in their voice, saved as an audio file.
  const saveClip = useCallback(
    (turn: ChatTurn) => {
      if (!turn.audio?.length) return;
      const chunks = [...turn.audio].sort((a, b) => a.sentenceIndex - b.sentenceIndex);
      const mime = chunks[0]?.mime || "audio/mpeg";
      const blob = new Blob(
        chunks.map((c) => new Uint8Array(base64ToArrayBuffer(c.base64))),
        { type: mime },
      );
      const ext = mime.includes("wav") ? "wav" : "mp3";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${headerName} — ${new Date().toLocaleDateString("en-GB")}.${ext}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 5000);
      trackEvent("keepsake_clip_saved", { chunks: chunks.length });
    },
    [headerName],
  );

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

  // Premiere: the very first conversation with this person, until their
  // first words have fully landed. Derived, so it ends itself the moment
  // the greeting finishes streaming.
  const premiere =
    hasBegun &&
    firstEver &&
    !turns.some((t) => t.role === "assistant" && t.id !== streamingTurnId);

  return (
    <div
      className="relative flex flex-col"
      style={{ minHeight: "100dvh" }}
    >
      {/* Sticky: the name and the History/Transcript controls must survive
          the scroll the transcript introduces. During the premiere the
          chrome steps back so the first words own the room. */}
      <header
        className={`sticky top-0 z-30 bg-[var(--color-ink)]/75 backdrop-blur-xl transition-opacity duration-1000 ${
          premiere ? "pointer-events-none opacity-25" : "opacity-100"
        }`}
      >
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-3 sm:px-8 sm:py-4">
          {/* Back to the person — the conversation belongs to them */}
          <Link
            href={backHref}
            aria-label="Back"
            className="flex h-11 w-11 items-center justify-center rounded-lg text-[var(--color-bone-dim)] transition hover:text-[var(--color-bone)]"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M19 12H5M11 6l-6 6 6 6" />
            </svg>
          </Link>

          <div className="hidden flex-col items-center text-center sm:flex">
            <span className="font-serif text-[15px] tracking-[-0.005em] text-[var(--color-bone)]">
              {headerName}
            </span>
            <span className="text-[11px] tracking-[0.04em] text-[var(--color-text-secondary)]">
              {headerSubtitle}
            </span>
          </div>

          <div className="flex items-center justify-end gap-x-1 text-[12px]">
            {/* Mobile: two icon buttons with 44px touch targets */}
            <button
              type="button"
              onClick={restart}
              className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-lg text-[var(--color-bone-dim)] transition hover:text-[var(--color-bone)] sm:hidden"
              aria-label="New conversation"
            >
              {/* Compose glyph — the bare "+" reads as "add person" elsewhere */}
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M11 5H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-5" />
                <path d="M17.4 3.6a2 2 0 0 1 2.8 2.8L13 13.6l-3.8.8.8-3.8 7.4-7z" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => setShowHistory((open) => !open)}
              aria-expanded={showHistory}
              className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-lg text-[var(--color-bone-dim)] transition hover:text-[var(--color-bone)] sm:hidden"
              aria-label="Past conversations"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7v5l3 3" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => setShowTranscript((open) => !open)}
              aria-expanded={showTranscript}
              className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-lg text-[var(--color-bone-dim)] transition hover:text-[var(--color-bone)] sm:hidden"
              aria-label="Transcript"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M4 6h16M4 10h16M4 14h10" />
              </svg>
            </button>

            {/* Desktop: text links — management lives on the person's page */}
            <div className="hidden items-center gap-x-4 sm:flex">
              <button type="button" onClick={restart} className="cursor-pointer text-[var(--color-bone-dim)] transition hover:text-[var(--color-bone)]">New conversation</button>
              <button type="button" onClick={() => setShowTranscript((open) => !open)} aria-expanded={showTranscript} className="cursor-pointer text-[var(--color-bone-dim)] transition hover:text-[var(--color-bone)]">Transcript</button>
              <button type="button" onClick={() => setShowHistory((open) => !open)} aria-expanded={showHistory} className="cursor-pointer text-[var(--color-bone-dim)] transition hover:text-[var(--color-bone)]">History</button>
              <Link href={backHref} className="text-[var(--color-bone-dim)] transition hover:text-[var(--color-bone)]">
                {backHref === "/people" ? "Your people" : "Persona & memories"}
              </Link>
            </div>
          </div>
        </div>
      </header>

      <main
        className={`relative flex flex-1 flex-col items-center justify-center px-6 transition-[padding] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] sm:px-8 ${
          showTranscript ? "lg:pr-[28rem]" : ""
        }`}
        style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}
      >
        {/* Completed turns only — streaming token appends must not be
            re-announced on every delta. */}
        <div aria-live="polite" className="sr-only">
          {latestTurn && latestTurn.id !== streamingTurnId ? latestTurn.content : ""}
        </div>
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
                  // Clamped so a long reply never shoves the orb off-screen —
                  // the full text always lives in the transcript.
                  latestTurn.role === "assistant"
                    ? "line-clamp-4 font-serif text-balance text-[22px] leading-[1.45] text-[var(--color-bone)] sm:text-[28px]"
                    : "line-clamp-3 text-balance text-[15px] leading-[1.55] text-[var(--color-bone-dim)] italic sm:text-[17px]"
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
          {/* One reserved status row: interrupt, error, or notice — never
              stacked, so the orb doesn't jump when state changes. */}
          <div className="mb-2 flex min-h-[3.25rem] w-full items-center justify-center">
            {responseError ? (
              <div className="flex flex-wrap items-center justify-center gap-3 text-center" role="alert">
                <p className="text-[13px] text-[var(--color-danger)]">
                  {responseError}
                </p>
                <button
                  type="button"
                  onClick={() => void retryLast()}
                  className="flex h-11 items-center rounded-full border border-[var(--color-rule-strong)] px-5 text-[13px] text-[var(--color-bone)]/85 transition hover:border-[var(--color-ember)]/40"
                >
                  Retry reply
                </button>
              </div>
            ) : status === "speaking" || status === "thinking" ? (
              <button
                type="button"
                onClick={interrupt}
                className="flex h-11 items-center rounded-full border border-[var(--color-rule-strong)] px-5 text-[13px] text-[var(--color-bone)]/85 transition hover:border-[var(--color-ember)]/40"
              >
                Interrupt
              </button>
            ) : responseNotice ? (
              <p className="max-w-md text-center text-[12px] leading-[1.6] text-[var(--color-bone-dim)]" role="status">
                {responseNotice}
              </p>
            ) : null}
          </div>
          {opened ? (
            <Composer
              disabled={status === "thinking"}
              personaBusy={status === "thinking" || status === "speaking"}
              playbackAmplitude={amplitude}
              onSend={(t) => void send(t)}
              onTranscribe={transcribe}
              onSpeechStateChange={handleSpeechState}
              onActivate={ensureUnlocked}
              onBargeIn={bargeIn}
            />
          ) : (
            <BeginGate
              name={headerName}
              seed={`${voiceId}:${headerName}`}
              onBegin={() => void openSession()}
            />
          )}
        </div>

        {showTranscript ? (
          <Transcript
            turns={turns}
            streamingTurnId={streamingTurnId}
            onReplay={(turn) => void replayTurn(turn)}
            onSaveClip={saveClip}
            onRemember={rememberTurn}
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
          manageHref={backHref}
          onClose={() => setShowHistory(false)}
          onOpen={(id) => {
            if (id !== currentConversationId) summariseRef.current();
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
          onDelete={(id, title) => setPendingDelete({ id, title })}
        />

        <ConfirmDialog
          open={pendingDelete !== null}
          title="Delete this conversation?"
          body={`"${pendingDelete?.title ?? ""}" and its transcript will be permanently removed.`}
          confirmLabel="Delete conversation"
          onConfirm={() => {
            if (pendingDelete) {
              deleteConversation(pendingDelete.id);
              void deleteConversationDb(pendingDelete.id).catch(console.error);
            }
            setPendingDelete(null);
          }}
          onCancel={() => setPendingDelete(null)}
        />
      </main>
    </div>
  );
}

function HistoryDrawer({
  open,
  conversations,
  currentConversationId,
  manageHref,
  onClose,
  onOpen,
  onNew,
  onPin,
  onDelete,
}: {
  open: boolean;
  conversations: ReturnType<typeof useSession.getState>["conversations"];
  currentConversationId: string | null;
  manageHref: string;
  onClose: () => void;
  onOpen: (id: string) => void;
  onNew: () => void;
  onPin: (id: string) => void;
  onDelete: (id: string, title: string) => void;
}) {
  const panelRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        // Keep Tab cycling inside the dialog — it's modal, the page behind
        // is inert to the keyboard.
        const focusable = panelRef.current?.querySelectorAll<HTMLElement>(
          "button, [href], [tabindex]:not([tabindex='-1'])",
        );
        if (!focusable?.length) return;
        const first = focusable[0]!;
        const last = focusable[focusable.length - 1]!;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    // Move focus into the panel so keyboard users land where they clicked to.
    panelRef.current?.focus();
    return () => {
      window.removeEventListener("keydown", onKey);
      previouslyFocused?.focus();
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open ? (
        <>
          {/* Scrim — tap anywhere outside to dismiss */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-black/45 backdrop-blur-[2px]"
            aria-hidden
          />
          {/* Mobile: bottom sheet. Desktop: floating panel under the History button. */}
          <motion.aside
            ref={panelRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label="Past conversations"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
            className="hairline-strong fixed inset-x-0 bottom-0 z-50 flex max-h-[78dvh] flex-col overflow-hidden rounded-t-3xl bg-[var(--color-ink-2)]/97 shadow-2xl outline-none backdrop-blur-xl sm:inset-x-auto sm:bottom-auto sm:right-6 sm:top-24 sm:max-h-[min(620px,calc(100dvh-7.5rem))] sm:w-[380px] sm:rounded-2xl"
          >
            {/* Grab notch — mobile affordance for "this is a sheet" */}
            <div className="flex justify-center pt-2.5 sm:hidden" aria-hidden>
              <span className="h-1 w-9 rounded-full bg-[var(--color-rule-strong)]" />
            </div>

            <div className="flex items-center justify-between py-1 pl-5 pr-2 sm:border-b sm:border-[var(--color-rule)] sm:py-2">
              <p className="text-[12px] tracking-[0.18em] text-[var(--color-text-secondary)] uppercase">
                Conversations
              </p>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close history"
                className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-lg text-[var(--color-bone-dim)] transition hover:text-[var(--color-bone)]"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>

            <div
              className="flex-1 overflow-y-auto px-3 pb-3"
              style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
            >
              <button
                type="button"
                onClick={onNew}
                className="mb-2 flex min-h-[44px] w-full cursor-pointer items-center gap-2.5 rounded-xl border border-[var(--color-rule-strong)] px-3.5 text-left text-[13px] text-[var(--color-bone)]/85 transition hover:border-[var(--color-ember)]/35 hover:bg-white/[0.02]"
              >
                <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden>
                  <path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                New conversation
              </button>

              {conversations.length ? (
                <div className="space-y-0.5">
                  {conversations.map((conversation) => {
                    const current = conversation.id === currentConversationId;
                    return (
                      <div
                        key={conversation.id}
                        className={`group flex items-center rounded-xl pr-1 transition-colors ${
                          current ? "bg-white/[0.045]" : "hover:bg-white/[0.025]"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => onOpen(conversation.id)}
                          className="flex min-h-[56px] min-w-0 flex-1 cursor-pointer flex-col justify-center gap-1 py-2.5 pl-3.5 pr-1 text-left"
                        >
                          <span className="flex items-center gap-1.5">
                            {conversation.pinned ? (
                              <PinGlyph className="shrink-0 text-[var(--color-ember)]" filled />
                            ) : null}
                            <span className="truncate font-serif text-[16px] leading-snug text-[var(--color-bone)]">
                              {conversation.title}
                            </span>
                          </span>
                          <span className="text-[11px] text-[var(--color-text-tertiary)]">
                            {formatRelativeDay(conversation.updatedAt)} · {conversation.turns.length}{" "}
                            {conversation.turns.length === 1 ? "turn" : "turns"}
                            {current ? (
                              <span className="text-[var(--color-verdigris)]"> · now</span>
                            ) : null}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => onPin(conversation.id)}
                          aria-label={conversation.pinned ? "Unpin conversation" : "Pin conversation"}
                          aria-pressed={Boolean(conversation.pinned)}
                          className={`flex h-11 w-10 shrink-0 cursor-pointer items-center justify-center rounded-lg transition ${
                            conversation.pinned
                              ? "text-[var(--color-ember)] hover:text-[var(--color-ember-soft)]"
                              : "text-[var(--color-bone-dim)]/70 hover:text-[var(--color-bone)]"
                          }`}
                        >
                          <PinGlyph filled={Boolean(conversation.pinned)} />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDelete(conversation.id, conversation.title)}
                          aria-label="Delete conversation"
                          className="flex h-11 w-10 shrink-0 cursor-pointer items-center justify-center rounded-lg text-[var(--color-bone-dim)]/70 transition hover:text-[var(--color-danger)]"
                        >
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                            <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-.8 14.2a1 1 0 0 1-1 .8H6.8a1 1 0 0 1-1-.8L5 6" />
                          </svg>
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="px-2 py-4 text-[13px] leading-[1.6] text-[var(--color-text-secondary)]">
                  Nothing saved yet. Conversations are kept here automatically once you start talking.
                </p>
              )}

              <Link
                href={manageHref}
                className="mt-3 flex min-h-[44px] items-center px-2 text-[12px] text-[var(--color-bone-dim)] transition hover:text-[var(--color-bone)]"
              >
                {manageHref === "/people" ? "Your people →" : "Manage on their page →"}
              </Link>
            </div>
          </motion.aside>
        </>
      ) : null}
    </AnimatePresence>
  );
}

function PinGlyph({ filled, className }: { filled?: boolean; className?: string }) {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M12 17v5M9 4h6l1 7 2.5 2.5H5.5L8 11l1-7z" />
    </svg>
  );
}

function Transcript({
  turns,
  streamingTurnId,
  onFeedback,
  onReplay,
  onSaveClip,
  onRemember,
}: {
  turns: ChatTurn[];
  streamingTurnId: string | null;
  onFeedback: (turnId: string, feedback: NonNullable<ChatTurn["feedback"]>) => void;
  onReplay: (turn: ChatTurn) => void;
  onSaveClip: (turn: ChatTurn) => void;
  onRemember: (turn: ChatTurn) => void;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const sectionRef = useRef<HTMLElement | null>(null);
  const lastContent = turns.at(-1)?.content;

  // Newest turn stays visible: pin the log to the bottom as replies stream in.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [turns.length, lastContent]);

  // On open below the fold (mobile/tablet), bring it into view so the toggle
  // visibly does something. On desktop it's a fixed side panel — no scroll.
  useEffect(() => {
    if (window.matchMedia("(min-width: 1024px)").matches) return;
    sectionRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, []);

  return (
    <section
      ref={sectionRef}
      aria-label="Transcript"
      className="mt-8 w-full max-w-3xl pb-8 lg:fixed lg:top-20 lg:right-6 lg:bottom-6 lg:z-20 lg:mt-0 lg:w-[24rem] lg:max-w-none lg:pb-0"
    >
      <div
        ref={scrollRef}
        className="hairline max-h-[42dvh] overflow-y-auto rounded-2xl bg-white/[0.018] p-4 sm:p-5 lg:h-full lg:max-h-none lg:bg-[var(--color-ink-2)]/90 lg:backdrop-blur-xl"
      >
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
                onSaveClip={
                  turn.role === "assistant" && turn.audio?.length
                    ? () => onSaveClip(turn)
                    : undefined
                }
                onRemember={turn.role === "user" ? () => onRemember(turn) : undefined}
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

function BeginGate({ name, seed, onBegin }: { name: string; seed: string; onBegin: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      className="flex flex-col items-center gap-3"
    >
      {/* The presence breathes here before the first word — their unique
          voiceprint ring around the orb, in the spot the live one takes
          over after Begin. */}
      <div className="relative mb-5">
        <div className="absolute inset-[-14%] opacity-50">
          <VoicePrint seed={seed} size={0} className="h-full w-full" animated />
        </div>
        <VoiceOrb state="listening" playbackAmplitude={0} />
      </div>
      <button
        type="button"
        onClick={onBegin}
        className="hairline-strong group inline-flex cursor-pointer items-center gap-3 rounded-full bg-[var(--color-ink-2)]/85 px-7 py-4 text-[15px] text-[var(--color-bone)] backdrop-blur-xl transition-[transform,background] duration-300 hover:bg-[var(--color-ink-2)] active:scale-[0.99]"
      >
        <span className="relative grid h-2.5 w-2.5 place-items-center">
          <span className="absolute inset-0 animate-ping rounded-full bg-[var(--color-ember)]/50" />
          <span className="relative h-2 w-2 rounded-full bg-[var(--color-ember)]" />
        </span>
        Begin
      </button>
      <p className="text-[11px] tracking-[0.18em] text-[var(--color-bone-dim)]/85 uppercase">
        They will speak first
      </p>
      {/* Honest framing — never pretend this is anything other than what it is */}
      <p className="max-w-[260px] text-center text-[11px] leading-[1.6] text-[var(--color-text-tertiary)]">
        An AI voice built from recordings of {name}.
      </p>
    </motion.div>
  );
}
