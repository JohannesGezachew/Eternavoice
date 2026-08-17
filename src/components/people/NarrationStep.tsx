"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Button } from "@/components/ui/Button";
import { VoiceOrb } from "@/components/conversation/Composer";
import { startRecording, type ActiveRecorder } from "@/lib/audio/recorder";
import { trackEvent } from "@/lib/analytics";
import { formatSeconds } from "@/lib/utils";

export interface NarrationPersona {
  description?: string;
  relationship?: string;
  catchphrases?: string;
  speechStyle?: {
    warmth: number;
    directness: number;
    expressiveness: number;
    humor: number;
    talkativeness: number;
  };
}

export interface NarrationResult {
  persona: NarrationPersona;
  memories: string[];
}

type Phase = "intro" | "recording" | "processing" | "review" | "write" | "retry";

// Recording targets. We never cut anyone off — the ring just fills toward a
// gentle suggested length, and "Done" becomes the primary action once they've
// said enough to be worth extracting.
const MIN_USEFUL_MS = 40_000;
const SUGGESTED_MS = 120_000;
const MAX_MS = 210_000;

// Rotating prompts so nobody freezes. Gentle, in order, never a checklist.
const PROMPTS = [
  "Start with their name, and who they were to you.",
  "What did they always say?",
  "How did they make you feel?",
  "A moment with them you still think about.",
  "What do you never want to forget?",
];

export function NarrationStep({
  name,
  relationship,
  mode,
  onComplete,
}: {
  name: string;
  relationship?: string;
  mode: "self" | "persona";
  onComplete: (result: NarrationResult | null) => void;
}) {
  const [phase, setPhase] = useState<Phase>("intro");
  const [elapsed, setElapsed] = useState(0);
  const [rms, setRms] = useState(0);
  const [promptIndex, setPromptIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const [result, setResult] = useState<NarrationResult | null>(null);

  const recorderRef = useRef<ActiveRecorder | null>(null);
  // Generation token: getUserMedia is async, so the component can unmount
  // while it is still resolving. Without this the recorder lands on a dead
  // component and the mic stays live for the rest of the session.
  const armTokenRef = useRef(0);
  // The captured audio and its transcript survive a failed extraction, so a
  // backend hiccup never costs someone their two-to-three minute recording.
  const takeRef = useRef<{ blob: Blob; mimeType: string } | null>(null);
  const transcriptRef = useRef<string | null>(null);

  // Advance the prompt cards on a slow cadence while recording.
  useEffect(() => {
    if (phase !== "recording") return;
    const t = setInterval(() => {
      setPromptIndex((i) => Math.min(i + 1, PROMPTS.length - 1));
    }, 26_000);
    return () => clearInterval(t);
  }, [phase]);

  const stopRecorder = useCallback(() => {
    const rec = recorderRef.current;
    recorderRef.current = null;
    return rec ? rec.stop() : null;
  }, []);

  // Always release the mic on unmount. Bumping the token also discards any
  // recorder still being acquired, so it can't outlive the component.
  useEffect(() => {
    return () => {
      armTokenRef.current++;
      recorderRef.current?.cancel();
      recorderRef.current = null;
    };
  }, []);

  const runExtraction = useCallback(
    async (payload: { transcript: string }) => {
      const res = await fetch("/api/persona-extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript: payload.transcript,
          name,
          relationship,
          mode,
        }),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(json?.error || "Could not read that. You can try again.");
      }
      return (await res.json()) as NarrationResult;
    },
    [name, relationship, mode],
  );

  /**
   * Transcribe (unless already done) and extract. Kept separate from stopping
   * the recorder so a retry never needs the microphone again — the audio and
   * transcript are held in refs and reused.
   */
  const processTake = useCallback(async () => {
    setError(null);
    setPhase("processing");
    try {
      let transcript = transcriptRef.current;

      if (!transcript) {
        const audio = takeRef.current;
        if (!audio) throw new Error("Nothing was recorded.");
        const fd = new FormData();
        const ext = audio.mimeType.includes("mp4")
          ? "mp4"
          : audio.mimeType.includes("mpeg")
            ? "mp3"
            : "webm";
        fd.append("audio", audio.blob, `narration.${ext}`);
        const tRes = await fetch("/api/transcribe", { method: "POST", body: fd });
        if (!tRes.ok) throw new Error("Could not hear that clearly. You can try again.");
        const { text } = (await tRes.json()) as { text?: string };
        transcript = (text ?? "").trim();
        if (transcript.length < 12) {
          throw new Error("That was very short — try saying a little more about them.");
        }
        // Cached so a failure further down never re-spends transcription.
        transcriptRef.current = transcript;
      }

      const extracted = await runExtraction({ transcript });
      setResult(extracted);
      setPhase("review");
      trackEvent("narration_extracted", { memories: extracted.memories.length });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. You can try again.");
      // "retry" — never back to "intro", which would strand the recording.
      setPhase("retry");
      trackEvent("narration_failed");
    }
  }, [runExtraction]);

  const finishRecording = useCallback(async () => {
    if (!recorderRef.current) return;
    setPhase("processing");
    try {
      const audio = await stopRecorder();
      if (!audio) throw new Error("Nothing was recorded.");
      takeRef.current = { blob: audio.blob, mimeType: audio.mimeType };
      transcriptRef.current = null;
    } catch {
      setError("We couldn't save that recording. You can try again.");
      setPhase("intro");
      trackEvent("narration_failed");
      return;
    }
    await processTake();
  }, [stopRecorder, processTake]);

  const beginRecording = useCallback(async () => {
    setError(null);
    setElapsed(0);
    setRms(0);
    setPromptIndex(0);
    const myToken = ++armTokenRef.current;
    try {
      const rec = await startRecording({
        onLevel: (level) => setRms(level),
        onTick: (ms) => {
          setElapsed(ms);
          if (ms >= MAX_MS) void finishRecording();
        },
      });
      // Unmounted (or re-armed) while getUserMedia was resolving — release it
      // rather than leaving the microphone open on a dead component.
      if (myToken !== armTokenRef.current) {
        rec.cancel();
        return;
      }
      recorderRef.current = rec;
      setPhase("recording");
      trackEvent("narration_started");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Microphone unavailable.");
    }
  }, [finishRecording]);

  const submitTyped = useCallback(async () => {
    const transcript = typed.trim();
    if (transcript.length < 12) {
      setError("Tell me a little more about them first.");
      return;
    }
    setError(null);
    setPhase("processing");
    try {
      const extracted = await runExtraction({ transcript });
      setResult(extracted);
      setPhase("review");
      trackEvent("narration_extracted", { memories: extracted.memories.length, mode: "typed" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. You can try again.");
      setPhase("write");
    }
  }, [typed, runExtraction]);

  const ringProgress = Math.min(1, elapsed / SUGGESTED_MS);
  const canFinish = elapsed >= MIN_USEFUL_MS;

  return (
    <div className="flex flex-1 flex-col">
      {error ? (
        <p className="mb-6 text-small text-[var(--color-danger)]" role="alert">
          {error}
        </p>
      ) : null}

      <AnimatePresence mode="wait">
        {/* ── Intro ─────────────────────────────────────────────── */}
        {phase === "intro" ? (
          <motion.div
            key="intro"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="flex max-w-xl flex-col gap-8"
          >
            <div className="flex flex-col gap-3">
              <h1 className="font-serif text-display leading-[1.08] tracking-[-0.02em] text-balance text-[var(--color-bone)] sm:text-hero">
                Tell me about {name}.
              </h1>
              <p className="text-body leading-[1.7] text-[var(--color-text-secondary)]">
                Speak freely for two or three minutes, the way you&rsquo;d
                describe them to someone who never got to meet them. This is
                your voice, not theirs — it&rsquo;s how {name} learns who they
                were to you. There&rsquo;s no wrong way to do this.
              </p>
            </div>

            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <Button variant="primary" size="lg" onClick={() => void beginRecording()}>
                Start speaking
              </Button>
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setPhase("write");
                }}
                className="text-small text-[var(--color-bone-dim)] underline-offset-4 transition hover:text-[var(--color-bone)] hover:underline"
              >
                Prefer to write?
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                trackEvent("narration_skipped");
                onComplete(null);
              }}
              className="self-start text-small text-[var(--color-text-tertiary)] underline-offset-4 transition hover:text-[var(--color-bone-dim)] hover:underline"
            >
              Skip for now — I can tell them later
            </button>
          </motion.div>
        ) : null}

        {/* ── Recording ─────────────────────────────────────────── */}
        {phase === "recording" ? (
          <motion.div
            key="recording"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
            className="flex flex-1 flex-col items-center justify-center gap-8 py-6"
          >
            <div className="relative grid place-items-center">
              <ProgressRing progress={ringProgress} />
              <div className="absolute">
                <VoiceOrb state="hearing" playbackAmplitude={rms} />
              </div>
            </div>

            <div className="flex h-16 max-w-md items-center justify-center px-4 text-center">
              <AnimatePresence mode="wait">
                <motion.p
                  key={promptIndex}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.5 }}
                  className="font-serif text-lead leading-[1.4] text-balance text-[var(--color-bone)]/85 sm:text-title"
                >
                  {PROMPTS[promptIndex]}
                </motion.p>
              </AnimatePresence>
            </div>

            <div className="flex flex-col items-center gap-4">
              <span className="text-small tabular-nums tracking-[0.2em] text-[var(--color-text-tertiary)]">
                {formatSeconds(elapsed / 1000)}
              </span>
              <Button
                variant={canFinish ? "primary" : "outline"}
                size="lg"
                onClick={() => void finishRecording()}
              >
                {canFinish ? "That's enough — done" : "Keep going…"}
              </Button>
              <p className="text-small text-[var(--color-text-tertiary)]">
                {canFinish
                  ? "Stop whenever you're ready."
                  : "Take your time. You can stop after a minute."}
              </p>
            </div>
          </motion.div>
        ) : null}

        {/* ── Processing ────────────────────────────────────────── */}
        {phase === "processing" ? (
          <motion.div
            key="processing"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
            className="flex flex-1 flex-col items-center justify-center gap-7 py-10"
          >
            <VoiceOrb state="processing" playbackAmplitude={0} />
            <p className="max-w-sm text-center font-serif text-lead leading-[1.4] text-balance text-[var(--color-bone)]/85 sm:text-title">
              Taking in everything you said about {name}…
            </p>
          </motion.div>
        ) : null}

        {/* ── Retry — the recording is safe, only the processing failed ── */}
        {phase === "retry" ? (
          <motion.div
            key="retry"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="flex max-w-xl flex-col gap-6"
          >
            <div className="flex flex-col gap-3">
              <h1 className="font-serif text-display leading-[1.08] tracking-[-0.02em] text-balance text-[var(--color-bone)] sm:text-hero">
                Your recording is safe.
              </h1>
              <p className="text-body leading-[1.7] text-[var(--color-text-secondary)]">
                Something went wrong while I was taking it in — nothing you said
                was lost. Try again, and you won&rsquo;t have to speak twice.
              </p>
            </div>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <Button variant="primary" size="lg" onClick={() => void processTake()}>
                Try again
              </Button>
              <button
                type="button"
                onClick={() => {
                  // The transcript survived; let them fix it by hand.
                  setTyped(transcriptRef.current ?? "");
                  setError(null);
                  setPhase("write");
                }}
                className="text-small text-[var(--color-bone-dim)] underline-offset-4 transition hover:text-[var(--color-bone)] hover:underline"
              >
                {transcriptRef.current ? "Edit what I heard instead" : "Write it instead"}
              </button>
            </div>
            <button
              type="button"
              onClick={() => {
                takeRef.current = null;
                transcriptRef.current = null;
                setError(null);
                setPhase("intro");
              }}
              className="self-start text-small text-[var(--color-text-tertiary)] underline-offset-4 transition hover:text-[var(--color-bone-dim)] hover:underline"
            >
              Start over
            </button>
          </motion.div>
        ) : null}

        {/* ── Write (typed fallback) ────────────────────────────── */}
        {phase === "write" ? (
          <motion.div
            key="write"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="flex max-w-xl flex-col gap-6"
          >
            <div className="flex flex-col gap-3">
              <h1 className="font-serif text-display leading-[1.08] tracking-[-0.02em] text-balance text-[var(--color-bone)] sm:text-hero">
                Tell me about {name}.
              </h1>
              <p className="text-body leading-[1.7] text-[var(--color-text-secondary)]">
                Write as much or as little as you like — who they were, how they
                spoke, what you never want to forget.
              </p>
            </div>
            <textarea
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoFocus
              rows={8}
              maxLength={8000}
              placeholder={`${name} was…`}
              className="hairline-strong w-full resize-none rounded-2xl bg-white/[0.02] p-4 text-body leading-[1.7] text-[var(--color-bone)] placeholder:text-[var(--color-bone-dim)]/70 focus:outline-none"
            />
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <Button variant="primary" size="lg" onClick={() => void submitTyped()} disabled={!typed.trim()}>
                Continue
              </Button>
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setPhase("intro");
                }}
                className="text-small text-[var(--color-bone-dim)] underline-offset-4 transition hover:text-[var(--color-bone)] hover:underline"
              >
                Speak instead
              </button>
            </div>
          </motion.div>
        ) : null}

        {/* ── Review ────────────────────────────────────────────── */}
        {phase === "review" && result ? (
          <ReviewStep
            key="review"
            name={name}
            result={result}
            onConfirm={(edited) => {
              trackEvent("narration_confirmed", { memories: edited.memories.length });
              onComplete(edited);
            }}
            onRedo={() => {
              setResult(null);
              setTyped("");
              setError(null);
              setPhase("intro");
            }}
          />
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/**
 * The trust moment: show what the AI understood, let the person correct it
 * before it becomes {name}'s memory. Personality read is editable prose;
 * memories are editable chips.
 */
function ReviewStep({
  name,
  result,
  onConfirm,
  onRedo,
}: {
  name: string;
  result: NarrationResult;
  onConfirm: (edited: NarrationResult) => void;
  onRedo: () => void;
}) {
  const [description, setDescription] = useState(result.persona.description ?? "");
  const [memories, setMemories] = useState<string[]>(result.memories);
  const [draft, setDraft] = useState("");

  const updateMemory = (i: number, value: string) =>
    setMemories((list) => list.map((m, idx) => (idx === i ? value : m)));
  const removeMemory = (i: number) =>
    setMemories((list) => list.filter((_, idx) => idx !== i));
  const addMemory = () => {
    const v = draft.trim();
    if (!v) return;
    setMemories((list) => [...list, v]);
    setDraft("");
  };

  const confirm = () => {
    onConfirm({
      persona: { ...result.persona, description: description.trim() || undefined },
      memories: memories.map((m) => m.trim()).filter(Boolean),
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="flex max-w-xl flex-col gap-8"
    >
      <div className="flex flex-col gap-3">
        <h1 className="font-serif text-display leading-[1.08] tracking-[-0.02em] text-balance text-[var(--color-bone)] sm:text-hero">
          Here&rsquo;s what I heard.
        </h1>
        <p className="text-body leading-[1.7] text-[var(--color-text-secondary)]">
          Change anything that isn&rsquo;t right. {name} will carry this into
          every conversation — you can always add more later.
        </p>
      </div>

      {/* Personality read */}
      <div className="flex flex-col gap-2">
        <span className="text-small tracking-[0.14em] text-[var(--color-bone-dim)] uppercase">
          Who they were
        </span>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          maxLength={600}
          placeholder="A sentence or two about them…"
          className="hairline-strong w-full resize-none rounded-2xl bg-white/[0.02] p-4 text-body leading-[1.65] text-[var(--color-bone)]/90 placeholder:text-[var(--color-bone-dim)]/70 focus:outline-none"
        />
      </div>

      {/* Memories */}
      <div className="flex flex-col gap-3">
        <span className="text-small tracking-[0.14em] text-[var(--color-bone-dim)] uppercase">
          What they&rsquo;ll remember
        </span>
        <div className="flex flex-col gap-2">
          {memories.map((m, i) => (
            <div
              key={i}
              className="group flex items-center gap-2 rounded-xl border border-[var(--color-rule)] bg-white/[0.015] px-3 py-2 transition-colors focus-within:border-[var(--color-ember)]/40 hover:border-[var(--color-rule-strong)]"
            >
              <input
                value={m}
                onChange={(e) => updateMemory(i, e.target.value)}
                maxLength={240}
                aria-label={`Memory ${i + 1}`}
                className="min-w-0 flex-1 bg-transparent text-body leading-[1.5] text-[var(--color-bone)]/90 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => removeMemory(i)}
                aria-label="Remove"
                className="flex min-h-[44px] shrink-0 items-center rounded-lg px-3 text-small text-[var(--color-text-tertiary)] transition-colors hover:text-[var(--color-danger)]"
              >
                Remove
              </button>
            </div>
          ))}
          {memories.length === 0 ? (
            <p className="text-small text-[var(--color-text-tertiary)]">
              Nothing captured yet — add anything they should carry.
            </p>
          ) : null}
        </div>
        <div className="flex gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") addMemory();
            }}
            maxLength={240}
            placeholder="Add something they should always remember"
            aria-label="Add a memory"
            className="hairline min-w-0 flex-1 rounded-xl bg-white/[0.02] px-3 py-2 text-body text-[var(--color-bone)] placeholder:text-[var(--color-bone-dim)]/70 focus:outline-none"
          />
          <Button variant="outline" size="md" onClick={addMemory} disabled={!draft.trim()}>
            Add
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Button variant="primary" size="lg" onClick={confirm}>
          Save &amp; continue
        </Button>
        <button
          type="button"
          onClick={onRedo}
          className="text-small text-[var(--color-bone-dim)] underline-offset-4 transition hover:text-[var(--color-bone)] hover:underline"
        >
          Tell it again
        </button>
      </div>
    </motion.div>
  );
}

/** A soft ember progress ring behind the orb — fills toward the suggested
 *  length. Reassurance, not a countdown. */
function ProgressRing({ progress }: { progress: number }) {
  const size = 240;
  const stroke = 2;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} className="rotate-[-90deg]" aria-hidden>
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="var(--color-rule-strong)"
        strokeWidth={stroke}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="var(--color-ember)"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - progress)}
        style={{ transition: "stroke-dashoffset 0.5s linear", opacity: 0.6 }}
      />
    </svg>
  );
}
