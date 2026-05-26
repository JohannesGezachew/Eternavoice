"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  motion,
  AnimatePresence,
  useMotionValue,
  useTransform,
} from "framer-motion";
import { startRecording, type ActiveRecorder } from "@/lib/audio/recorder";
import { cn } from "@/lib/utils";

interface ComposerProps {
  disabled?: boolean;
  personaBusy?: boolean;
  /** RMS amplitude of the persona's TTS playback. Used to drive the
   *  "responding" animation in the composer area. */
  playbackAmplitude?: number;
  onSend: (text: string) => void;
  onTranscribe: (audio: Blob, mimeType: string) => Promise<string | null>;
  onSpeechStateChange?: (state: "idle" | "recording" | "transcribing") => void;
  onActivate?: () => void | Promise<void>;
}

// Voice-activity tunables. Tuned for typical room conditions with browser AGC
// enabled. SPEECH_RMS is permissive — false triggers are filtered out by the
// MIN_TURN_MS gate before we transcribe.
const SPEECH_RMS = 0.025;
const END_SILENCE_MS = 1100;
const MIN_TURN_MS = 350;
const MAX_TURN_MS = 30_000;

export function Composer({
  disabled,
  personaBusy = false,
  playbackAmplitude = 0,
  onSend,
  onTranscribe,
  onSpeechStateChange,
  onActivate,
}: ComposerProps) {
  const [mode, setMode] = useState<"voice" | "text">("voice");
  const [text, setText] = useState("");
  const [hearingUser, setHearingUser] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Bumped to nudge the re-arm effect when a turn closes without sending
  // (no real speech / empty transcript).
  const [armTick, setArmTick] = useState(0);
  const [didActivate, setDidActivate] = useState(false);

  const recorderRef = useRef<ActiveRecorder | null>(null);
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const closingRef = useRef(false);
  const armingRef = useRef(false);
  const armTokenRef = useRef(0);
  const personaBusyRef = useRef(personaBusy);
  const turnRef = useRef<{
    firstLoudAt: number | null;
    lastLoudAt: number;
    startedAt: number;
  }>({ firstLoudAt: null, lastLoudAt: 0, startedAt: 0 });

  // Stable refs for parent callbacks. Read at call time so render churn
  // doesn't invalidate the recorder lifecycle.
  const onTranscribeRef = useRef(onTranscribe);
  const onSendRef = useRef(onSend);
  const onActivateRef = useRef(onActivate);
  const onSpeechStateChangeRef = useRef(onSpeechStateChange);
  useEffect(() => {
    onTranscribeRef.current = onTranscribe;
    onSendRef.current = onSend;
    onActivateRef.current = onActivate;
    onSpeechStateChangeRef.current = onSpeechStateChange;
  });

  useEffect(() => {
    personaBusyRef.current = personaBusy;
  }, [personaBusy]);

  useEffect(() => {
    onSpeechStateChangeRef.current?.(
      processing ? "transcribing" : hearingUser ? "recording" : "idle",
    );
  }, [processing, hearingUser]);

  useEffect(() => {
    if (mode !== "text") return;
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 220)}px`;
    ta.focus();
  }, [text, mode]);

  // === Always-on listening loop ===

  const closeAndSendTurn = useCallback(async () => {
    if (closingRef.current) return;
    const recorder = recorderRef.current;
    if (!recorder) return;
    closingRef.current = true;
    armTokenRef.current++;
    recorderRef.current = null;
    setHearingUser(false);
    setProcessing(true);

    const t = turnRef.current;
    const realSpeech =
      t.firstLoudAt !== null && performance.now() - t.firstLoudAt >= MIN_TURN_MS;

    let didSend = false;
    try {
      const result = await recorder.stop();
      if (realSpeech) {
        const transcript = await onTranscribeRef.current(
          result.blob,
          result.mimeType,
        );
        const trimmed = (transcript ?? "").trim();
        if (process.env.NODE_ENV !== "production") {
          console.log("[EternaVoice] turn closed", {
            realSpeech,
            transcriptLength: trimmed.length,
            transcriptPreview: trimmed.slice(0, 80),
          });
        }
        if (trimmed) {
          didSend = true;
          onSendRef.current(trimmed);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "We couldn't hear that.");
    } finally {
      setProcessing(false);
      if (!didSend) {
        // Nothing went out — release the lock and ask for a re-arm.
        closingRef.current = false;
        setArmTick((n) => n + 1);
      }
    }
  }, []);

  const armRecorder = useCallback(async () => {
    if (recorderRef.current) return;
    if (closingRef.current) return;
    if (armingRef.current) return;
    armingRef.current = true;

    const myToken = ++armTokenRef.current;
    turnRef.current = {
      firstLoudAt: null,
      lastLoudAt: performance.now(),
      startedAt: performance.now(),
    };
    setHearingUser(false);

    try {
      const recorder = await startRecording({
        onLevel: (rms) => {
          if (myToken !== armTokenRef.current) return;
          if (closingRef.current) return;
          // Ignore audio while the persona is replying. We keep the recorder
          // physically running (so the mic visual stays alive and the next
          // utterance is ready to capture instantly), but we don't act on
          // audio that might be the persona's own voice bleeding back through.
          if (personaBusyRef.current) {
            // Keep the turn timer fresh so the moment persona finishes, the
            // VAD silence-window restarts cleanly.
            turnRef.current = {
              firstLoudAt: null,
              lastLoudAt: performance.now(),
              startedAt: performance.now(),
            };
            return;
          }
          const now = performance.now();
          const t = turnRef.current;
          if (rms > SPEECH_RMS) {
            if (t.firstLoudAt === null) {
              t.firstLoudAt = now;
              setHearingUser(true);
            }
            t.lastLoudAt = now;
          }
          if (
            t.firstLoudAt !== null &&
            now - t.lastLoudAt > END_SILENCE_MS
          ) {
            void closeAndSendTurn();
            return;
          }
          if (
            t.firstLoudAt !== null &&
            now - t.firstLoudAt > MAX_TURN_MS
          ) {
            void closeAndSendTurn();
            return;
          }
        },
      });
      if (myToken !== armTokenRef.current) {
        recorder.cancel();
        return;
      }
      recorderRef.current = recorder;
      if (process.env.NODE_ENV !== "production") {
        console.log("[EternaVoice] mic armed, listening");
      }
    } catch (err) {
      if (process.env.NODE_ENV !== "production") {
        console.warn("[EternaVoice] mic arm failed", err);
      }
      setError(err instanceof Error ? err.message : "Microphone unavailable.");
    } finally {
      armingRef.current = false;
    }
  }, [closeAndSendTurn]);

  // Once the parent transitions to personaBusy, our send is officially in
  // flight; release the close-lock so re-arming proceeds normally.
  useEffect(() => {
    if (personaBusy) closingRef.current = false;
  }, [personaBusy]);

  // Keep VAD timing fresh while persona is replying so we don't fire on the
  // tail of audio captured during the reply.
  useEffect(() => {
    if (!personaBusy) {
      turnRef.current = {
        firstLoudAt: null,
        lastLoudAt: performance.now(),
        startedAt: performance.now(),
      };
    }
  }, [personaBusy]);

  // Auto-engage on mount: the user already gestured (Tap to begin) one screen
  // up, so audio is unlocked. Light up the mic and keep it on for the session.
  useEffect(() => {
    let cancelled = false;
    const engage = async () => {
      if (didActivate) return;
      try {
        await onActivateRef.current?.();
      } catch {
        // non-fatal
      }
      if (cancelled) return;
      setDidActivate(true);
      void armRecorder();
    };
    void engage();
    return () => {
      cancelled = true;
    };
  }, [didActivate, armRecorder]);

  // Lifecycle: re-arm whenever the recorder is missing and we're not closing
  // a turn. Recorder is NOT torn down during personaBusy — we keep it alive
  // and simply gate the VAD callback above.
  useEffect(() => {
    if (!didActivate) return;
    if (closingRef.current) return;
    if (recorderRef.current) return;
    if (armingRef.current) return;
    void armRecorder();
  }, [didActivate, armRecorder, armTick, personaBusy]);

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      // Mutable lifecycle token, not a DOM ref.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      armTokenRef.current++;
      recorderRef.current?.cancel();
      recorderRef.current = null;
    };
  }, []);

  // === Text composer ===

  const submit = () => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setText("");
  };

  // === UI ===

  const visualState: "responding" | "processing" | "hearing" | "listening" =
    personaBusy
      ? "responding"
      : processing
        ? "processing"
        : hearingUser
          ? "hearing"
          : "listening";

  const caption = (() => {
    switch (visualState) {
      case "responding":
        return "Responding…";
      case "processing":
        return "Hearing you…";
      case "hearing":
        return "Listening";
      default:
        return "I'm here — speak whenever";
    }
  })();

  return (
    <div className="relative w-full">
      <AnimatePresence>
        {error ? (
          <motion.p
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="absolute -top-7 left-1/2 -translate-x-1/2 text-[12px] text-[var(--color-ember-soft)]"
          >
            {error}
          </motion.p>
        ) : null}
      </AnimatePresence>

      <AnimatePresence mode="wait" initial={false}>
        {mode === "voice" ? (
          <motion.div
            key="voice"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="flex flex-col items-center gap-4"
          >
            <VoiceOrb
              state={visualState}
              playbackAmplitude={playbackAmplitude}
            />

            <div className="flex h-5 items-center text-[12px] tracking-[0.22em] uppercase">
              <span
                className={cn(
                  "transition-colors duration-300",
                  visualState === "hearing"
                    ? "text-[var(--color-ember)]"
                    : visualState === "responding"
                      ? "text-[var(--color-bone)]/90"
                      : "text-[var(--color-bone-dim)]/80",
                )}
              >
                {caption}
              </span>
            </div>

            <button
              type="button"
              onClick={() => setMode("text")}
              className="text-[12px] text-[var(--color-bone-dim)] underline-offset-4 transition hover:text-[var(--color-bone)] hover:underline"
            >
              or type a message
            </button>
          </motion.div>
        ) : (
          <motion.div
            key="text"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="hairline-strong flex flex-col gap-2 rounded-3xl bg-[var(--color-ink-2)]/85 p-3 backdrop-blur-xl transition-colors"
          >
            <div className="flex w-full items-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setText("");
                  setMode("voice");
                }}
                aria-label="Switch to voice"
                className="grid h-11 w-11 shrink-0 self-end place-items-center rounded-full border border-[var(--color-rule-strong)] bg-white/[0.03] text-[var(--color-bone)]/85 transition-all duration-300 hover:bg-white/[0.06]"
              >
                <MicIcon active={false} />
              </button>

              <textarea
                ref={taRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    submit();
                  }
                }}
                placeholder={disabled ? "Waiting for the reply..." : "Type a message."}
                rows={1}
                disabled={disabled}
                className="block max-h-[220px] w-full resize-none bg-transparent px-3 py-2 text-[16px] leading-[1.55] text-[var(--color-bone)] placeholder:text-[var(--color-bone-dim)]/60 focus:outline-none disabled:opacity-60"
              />

              <button
                type="button"
                onClick={submit}
                disabled={disabled || !text.trim()}
                className="grid h-11 w-11 shrink-0 self-end place-items-center rounded-full bg-[var(--color-bone)] text-[var(--color-ink)] transition-[transform,opacity,background] duration-300 hover:bg-[var(--color-bone-2)] disabled:opacity-30 active:scale-95"
                aria-label="Send"
              >
                <SendIcon />
              </button>
            </div>
            <p className="px-14 text-[11px] text-[var(--color-bone-dim)]/60">
              Enter sends. Shift Enter adds a line.
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface VoiceOrbProps {
  state: "responding" | "processing" | "hearing" | "listening";
  playbackAmplitude: number;
}

/**
 * Big, breathing, ChatGPT-voice-style orb. Multi-layered:
 *   1. Ambient outer halo (largest, blurred, slow breath).
 *   2. Gradient core sphere with smoke-like depth.
 *   3. Specular highlight near the top.
 *   4. State-specific reactive aura — emanating waves while hearing,
 *      bone-bright amplitude pulse while responding, slow swirl while
 *      processing.
 *
 * Amplitude (the persona's TTS playback) drives the scale & glow while
 * responding so the orb visibly "speaks" with the voice.
 */
function VoiceOrb({ state, playbackAmplitude }: VoiceOrbProps) {
  const isResponding = state === "responding";
  const isHearing = state === "hearing";
  const isProcessing = state === "processing";

  const scale = useMotionValue(1);
  const haloScale = useMotionValue(1);
  const haloOpacity = useMotionValue(0.45);
  const coreOpacity = useMotionValue(0.78);
  const specularOpacity = useMotionValue(0.55);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const t = performance.now();
      const breath = 1 + Math.sin(t / 2400) * 0.03;
      let targetScale = breath;
      let targetHaloScale = 1 + Math.sin(t / 3200) * 0.04;
      let targetHaloOpacity = 0.45;
      let targetCoreOpacity = 0.78;
      let targetSpecular = 0.55;

      if (isResponding) {
        const amp = Math.min(0.5, playbackAmplitude * 5);
        targetScale = breath * (1 + amp * 0.25);
        targetHaloScale = 1 + amp * 0.5 + Math.sin(t / 1100) * 0.03;
        targetHaloOpacity = 0.65 + amp * 0.4;
        targetCoreOpacity = 0.9 + amp * 0.1;
        targetSpecular = 0.7 + amp * 0.25;
      } else if (isHearing) {
        const pulse = 1 + Math.sin(t / 380) * 0.04;
        targetScale = breath * pulse;
        targetHaloScale = 1 + Math.sin(t / 380) * 0.1;
        targetHaloOpacity = 0.7;
      } else if (isProcessing) {
        targetScale = breath;
        targetHaloOpacity = 0.5 + Math.sin(t / 700) * 0.12;
      }

      scale.set(scale.get() * 0.85 + targetScale * 0.15);
      haloScale.set(haloScale.get() * 0.85 + targetHaloScale * 0.15);
      haloOpacity.set(haloOpacity.get() * 0.85 + targetHaloOpacity * 0.15);
      coreOpacity.set(coreOpacity.get() * 0.9 + targetCoreOpacity * 0.1);
      specularOpacity.set(specularOpacity.get() * 0.9 + targetSpecular * 0.1);

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [
    isResponding,
    isHearing,
    isProcessing,
    playbackAmplitude,
    scale,
    haloScale,
    haloOpacity,
    coreOpacity,
    specularOpacity,
  ]);

  const haloFilter = useTransform(haloOpacity, (v) => `opacity(${v.toFixed(3)})`);

  return (
    <div
      className="relative h-44 w-44 sm:h-52 sm:w-52 md:h-56 md:w-56"
      aria-hidden
    >
      {/* Outermost ambient halo — wide, blurred, sets the mood by state. */}
      <motion.div
        style={{ scale: haloScale, filter: haloFilter }}
        className="pointer-events-none absolute inset-[-30%] rounded-full blur-[60px]"
      >
        <div
          className={cn(
            "h-full w-full rounded-full transition-[background] duration-700",
            isResponding
              ? "bg-[radial-gradient(closest-side,rgba(245,239,230,0.55),rgba(199,162,124,0.18)_50%,transparent_75%)]"
              : isHearing
                ? "bg-[radial-gradient(closest-side,rgba(214,140,107,0.5),rgba(214,140,107,0.06)_55%,transparent_75%)]"
                : "bg-[radial-gradient(closest-side,rgba(214,140,107,0.32),rgba(214,140,107,0.04)_55%,transparent_75%)]",
          )}
        />
      </motion.div>

      {/* Hairline ring — gives the sphere structure. */}
      <motion.div
        style={{ scale }}
        className="absolute inset-[10%] rounded-full border border-[var(--color-rule-strong)] bg-[radial-gradient(closest-side,rgba(245,239,230,0.05),transparent_70%)]"
      />

      {/* Core gradient sphere. */}
      <motion.div
        style={{ scale, opacity: coreOpacity }}
        className={cn(
          "absolute inset-[24%] rounded-full mix-blend-screen transition-[background] duration-700",
          isResponding
            ? "bg-[radial-gradient(closest-side,rgba(245,239,230,0.6),rgba(245,239,230,0.18)_45%,rgba(199,162,124,0.05)_75%,transparent_90%)]"
            : "bg-[radial-gradient(closest-side,rgba(245,239,230,0.42),rgba(199,162,124,0.18)_50%,transparent_85%)]",
        )}
      />

      {/* Specular highlight — adds dimensionality. */}
      <motion.div
        style={{ opacity: specularOpacity }}
        className="pointer-events-none absolute top-[26%] left-[30%] h-[14%] w-[18%] rounded-full bg-white/80 blur-[10px]"
      />

      {/* State-specific reactive overlays. */}
      {isHearing ? <HearingRipples /> : null}
      {isProcessing ? <ProcessingSwirl /> : null}
      {isResponding ? <RespondingShimmer /> : null}
    </div>
  );
}

/** Outward-emanating rings while we hear the user speak. */
function HearingRipples() {
  return (
    <div className="pointer-events-none absolute inset-0">
      {[0, 0.6, 1.2].map((delay, i) => (
        <motion.span
          key={i}
          className="absolute inset-[8%] rounded-full border border-[var(--color-ember)]/55"
          initial={{ scale: 0.85, opacity: 0 }}
          animate={{ scale: [0.85, 1.35], opacity: [0.7, 0] }}
          transition={{
            duration: 1.8,
            repeat: Infinity,
            ease: "easeOut",
            delay,
          }}
        />
      ))}
    </div>
  );
}

/** Slow rotating arc while we transcribe the user's turn. */
function ProcessingSwirl() {
  return (
    <motion.span
      className="pointer-events-none absolute inset-[18%] rounded-full"
      style={{
        background:
          "conic-gradient(from 0deg, rgba(245,239,230,0.0), rgba(245,239,230,0.55), rgba(245,239,230,0.0))",
        WebkitMaskImage:
          "radial-gradient(closest-side, transparent 64%, black 66%, black 70%, transparent 72%)",
        maskImage:
          "radial-gradient(closest-side, transparent 64%, black 66%, black 70%, transparent 72%)",
      }}
      animate={{ rotate: 360 }}
      transition={{ duration: 1.6, repeat: Infinity, ease: "linear" }}
    />
  );
}

/** A second rotating shimmer ring while the persona is speaking. */
function RespondingShimmer() {
  return (
    <>
      <motion.span
        className="pointer-events-none absolute inset-[14%] rounded-full"
        style={{
          background:
            "conic-gradient(from 0deg, rgba(245,239,230,0.0), rgba(245,239,230,0.35), rgba(245,239,230,0.0))",
          WebkitMaskImage:
            "radial-gradient(closest-side, transparent 70%, black 73%, black 77%, transparent 80%)",
          maskImage:
            "radial-gradient(closest-side, transparent 70%, black 73%, black 77%, transparent 80%)",
        }}
        animate={{ rotate: 360 }}
        transition={{ duration: 5, repeat: Infinity, ease: "linear" }}
      />
      <motion.span
        className="pointer-events-none absolute inset-[6%] rounded-full"
        style={{
          background:
            "conic-gradient(from 180deg, rgba(199,162,124,0.0), rgba(199,162,124,0.22), rgba(199,162,124,0.0))",
          WebkitMaskImage:
            "radial-gradient(closest-side, transparent 80%, black 83%, black 87%, transparent 90%)",
          maskImage:
            "radial-gradient(closest-side, transparent 80%, black 83%, black 87%, transparent 90%)",
        }}
        animate={{ rotate: -360 }}
        transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
      />
    </>
  );
}

function MicIcon({ active }: { active: boolean }) {
  return (
    <svg
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={active ? "text-[var(--color-ember)]" : "text-[var(--color-bone)]/85"}
    >
      <rect x="9" y="3" width="6" height="12" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <line x1="12" y1="18" x2="12" y2="22" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </svg>
  );
}
