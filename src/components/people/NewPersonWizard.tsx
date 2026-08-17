"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { AnimatePresence, motion } from "framer-motion";
import { AppShell } from "@/components/shell/AppShell";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Field";
import type { CloneResult } from "@/components/recording/RecordExperience";
import type { NarrationResult } from "./NarrationStep";
import { PersonAvatar } from "./PersonAvatar";
import { useSession } from "@/lib/session";
import { addMemoryDb } from "@/lib/db/memories";
import { trackEvent } from "@/lib/analytics";
import { cn, formatSeconds } from "@/lib/utils";
import type { PersonaConfig } from "@/lib/types";

/**
 * The two heaviest steps, loaded when they are reached rather than up front.
 *
 * This is the screen someone lands on to make the person they have lost, and
 * the first thing it shows is a name field and a row of relationship chips.
 * It was shipping roughly sixteen hundred lines of recording and narration
 * code — microphone handling, waveform rendering, audio conversion — before
 * any of that could paint. None of it is reachable until step two, and the
 * time spent typing a name is exactly when it can arrive unnoticed.
 *
 * ssr: false because both touch MediaRecorder and AudioContext on mount.
 */
const RecordExperience = dynamic(
  () => import("@/components/recording/RecordExperience").then((m) => m.RecordExperience),
  { ssr: false, loading: () => <StepLoading /> },
);

const NarrationStep = dynamic(
  () => import("./NarrationStep").then((m) => m.NarrationStep),
  { ssr: false, loading: () => <StepLoading /> },
);

/** Holds the step's height so advancing doesn't collapse the layout. */
function StepLoading() {
  return (
    <div
      role="status"
      aria-label="Loading"
      className="h-64 w-full animate-pulse rounded-2xl bg-white/[0.03]"
    />
  );
}

type Step = "who" | "narrate" | "voice" | "listen";

const STEPS: Array<{ id: Step; label: string }> = [
  { id: "who", label: "Who" },
  { id: "narrate", label: "About" },
  { id: "voice", label: "Voice" },
  { id: "listen", label: "Listen" },
];

const RELATIONSHIPS = [
  "My father",
  "My mother",
  "My grandfather",
  "My grandmother",
  "My partner",
  "A friend",
  "Myself",
  "Someone else",
];

/**
 * Guided creation: who they are → their voice → hear it → talk.
 * One question per screen; persona enrichment happens later in the hub,
 * after the first conversation, when it means something.
 */
export function NewPersonWizard() {
  const router = useRouter();
  const setVoice = useSession((s) => s.setVoice);
  const setPersona = useSession((s) => s.setPersona);
  const addMemoryRecord = useSession((s) => s.addMemoryRecord);
  const replaceMemory = useSession((s) => s.replaceMemory);
  const deleteMemory = useSession((s) => s.deleteMemory);

  const [step, setStep] = useState<Step>("who");
  const [name, setName] = useState("");
  const [relationship, setRelationship] = useState<string | null>(null);
  const [customRelationship, setCustomRelationship] = useState("");
  const [consent, setConsent] = useState(false);
  const [whoError, setWhoError] = useState<string | null>(null);
  const [clone, setClone] = useState<CloneResult | null>(null);
  // What the narration step captured about them — merged into the persona and
  // seeded as memories once the voice (and its subject row) exist.
  const [narration, setNarration] = useState<NarrationResult | null>(null);

  // The wizard survives a closed tab: restore what was entered, land on the
  // step they left (the clone itself can't persist — voice re-upload is the
  // only step that repeats).
  const restoredRef = useRef(false);
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    const t = setTimeout(() => {
      try {
        const raw = sessionStorage.getItem("ev-wizard");
        if (!raw) return;
        const saved = JSON.parse(raw) as {
          step?: Step;
          name?: string;
          relationship?: string | null;
          customRelationship?: string;
          consent?: boolean;
        };
        if (saved.name) setName(saved.name);
        if (saved.relationship) setRelationship(saved.relationship);
        if (saved.customRelationship) setCustomRelationship(saved.customRelationship);
        if (saved.consent) setConsent(true);
        // The narration result and clone are ephemeral, so resume anyone past
        // "who" at the narration step — they can narrate again or skip.
        if ((saved.step === "voice" || saved.step === "narrate") && saved.name?.trim()) {
          setStep("narrate");
        }
      } catch {
        // a fresh wizard is always a safe fallback
      }
    }, 0);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    try {
      sessionStorage.setItem(
        "ev-wizard",
        JSON.stringify({
          step: step === "listen" ? "narrate" : step,
          name,
          relationship,
          customRelationship,
          consent,
        }),
      );
    } catch {
      // storage full/blocked — persistence is a nicety
    }
  }, [step, name, relationship, customRelationship, consent]);

  const isSelf = relationship === "Myself";
  const resolvedRelationship =
    relationship === "Someone else"
      ? customRelationship.trim()
      : relationship === "Myself"
        ? ""
        : (relationship ?? "");

  const stepIndex = STEPS.findIndex((s) => s.id === step);

  const continueFromWho = () => {
    if (!name.trim()) {
      setWhoError("Their name is where it starts.");
      return;
    }
    if (!consent) {
      setWhoError("Please confirm you have the right to use their voice.");
      return;
    }
    setWhoError(null);
    trackEvent("wizard_who_completed", { relationship: relationship ?? "unset" });
    setStep("narrate");
  };

  // A complete persona for {personName}: the wizard's relationship plus
  // anything the narration inferred (a characterisation, phrases, style).
  const buildPersona = useCallback(
    (personName: string): PersonaConfig => {
      const p = narration?.persona;
      return {
        mode: isSelf ? "self" : "persona",
        name: personName,
        relationship: (p?.relationship || resolvedRelationship) || undefined,
        description: p?.description,
        catchphrases: p?.catchphrases,
        speechStyle: p?.speechStyle,
      };
    },
    [narration, isSelf, resolvedRelationship],
  );

  const handleCloned = useCallback(
    (result: CloneResult) => {
      setClone(result);
      // Stamp relationship + the narration-enriched persona onto the subject
      // the clone route created, and seed the narrated memories so the very
      // first conversation already remembers them.
      if (result.subjectId) {
        const persona = buildPersona(result.name);
        void fetch(`/api/subjects/${result.subjectId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            relationship: persona.relationship ?? resolvedRelationship,
            persona,
          }),
        }).catch(() => null);

        for (const content of narration?.memories ?? []) {
          // Seed optimistically, then reconcile to the row's real primary key.
          // The store used to mint its own id here while the database minted a
          // different one, so editing or deleting a narrated memory before the
          // next reload matched no row and silently did nothing.
          const localId = crypto.randomUUID();
          const now = Date.now();
          addMemoryRecord({
            id: localId,
            content,
            createdAt: now,
            updatedAt: now,
            subjectId: result.subjectId,
            source: "manual",
          });
          void addMemoryDb(content, result.subjectId)
            .then((saved) => replaceMemory(localId, saved))
            .catch(() => deleteMemory(localId));
        }
      }
      setStep("listen");
    },
    [resolvedRelationship, narration, buildPersona, addMemoryRecord, replaceMemory, deleteMemory],
  );

  const beginTalking = () => {
    if (!clone) return;
    try {
      sessionStorage.removeItem("ev-wizard");
    } catch {
      // nothing to clean
    }
    setVoice(clone.voiceId, clone.name, clone.subjectId);
    setPersona(buildPersona(clone.name));
    trackEvent("wizard_completed");
    router.push(clone.subjectId ? `/people/${clone.subjectId}/talk` : "/people/current/talk");
  };

  // One back affordance: the shell's arrow steps back through the wizard,
  // and only leaves the flow from the first step.
  const stepBack = () => {
    if (step === "listen") setStep("voice");
    else if (step === "voice") setStep("narrate");
    else if (step === "narrate") setStep("who");
    else router.push("/people");
  };

  return (
    <AppShell title="New person" onBack={stepBack} showTabs={false}>
    <main className="relative flex flex-1 flex-col">
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-6 pb-16 pt-6 sm:px-8">
      {/* ── Progress ─────────────────────────────────────────────── */}
      <nav aria-label="Setup progress" className="mb-10">
        <ol className="flex items-center gap-3">
          {STEPS.map(({ id, label }, i) => {
            const state = i < stepIndex ? "done" : i === stepIndex ? "active" : "todo";
            return (
              <li key={id} className="flex flex-1 flex-col gap-2 sm:flex-none sm:flex-row sm:items-center sm:gap-3">
                <span
                  className={cn(
                    "text-micro tracking-[0.18em] uppercase transition-colors duration-300",
                    state === "active"
                      ? "text-[var(--color-ember)]"
                      : state === "done"
                        ? "text-[var(--color-text-secondary)]"
                        : "text-[var(--color-text-tertiary)]",
                  )}
                  aria-current={state === "active" ? "step" : undefined}
                >
                  {label}
                </span>
                <span
                  className={cn(
                    "h-px w-full rounded-full transition-colors duration-500 sm:w-12",
                    state === "todo" ? "bg-[var(--color-rule-strong)]" : "bg-[var(--color-ember)]/60",
                  )}
                  aria-hidden
                />
              </li>
            );
          })}
        </ol>
      </nav>

      <AnimatePresence mode="wait">
        {/* ── Step 1 · Who ─────────────────────────────────────── */}
        {step === "who" ? (
          <motion.section
            key="who"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
            className="flex max-w-xl flex-col gap-8"
          >
            <div className="flex flex-col gap-3">
              <h1 className="font-serif text-display leading-[1.08] tracking-[-0.02em] text-balance text-[var(--color-bone)] sm:text-hero">
                Who do you want to hear again?
              </h1>
              <p className="text-body leading-[1.7] text-[var(--color-text-secondary)]">
                Just a name to begin. Everything else can come later.
              </p>
            </div>

            <div>
              <Label htmlFor="w-name">Their name</Label>
              <Input
                id="w-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") continueFromWho();
                }}
                placeholder="Margaret · Dad · Bill"
                autoComplete="off"
                autoFocus
                maxLength={60}
              />
            </div>

            <fieldset>
              <legend className="pb-3 text-small tracking-[0.14em] text-[var(--color-bone-dim)] uppercase">
                Who are they to you? <span className="ml-1 normal-case tracking-normal opacity-60">optional</span>
              </legend>
              <div className="flex flex-wrap gap-2">
                {RELATIONSHIPS.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRelationship((cur) => (cur === r ? null : r))}
                    aria-pressed={relationship === r}
                    className={cn(
                      "cursor-pointer rounded-full border px-4 py-2 text-small transition-all duration-200",
                      relationship === r
                        ? "border-[var(--color-ember)]/50 bg-[var(--color-ember)]/[0.08] text-[var(--color-bone)]"
                        : "border-[var(--color-rule-strong)] text-[var(--color-text-secondary)] hover:border-[var(--color-ember)]/30 hover:text-[var(--color-bone)]",
                    )}
                  >
                    {r}
                  </button>
                ))}
              </div>
              {relationship === "Someone else" ? (
                <div className="mt-3 max-w-xs">
                  <Input
                    value={customRelationship}
                    onChange={(e) => setCustomRelationship(e.target.value)}
                    placeholder="My uncle · My teacher · …"
                    maxLength={120}
                    aria-label="Describe the relationship"
                    autoFocus
                  />
                </div>
              ) : null}
            </fieldset>

            {/* The consent moment — legal cover, ethics signal, and trust
                builder in one. A product that takes the weight seriously is
                a product you trust with the weight. */}
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-[var(--color-rule)] bg-white/[0.02] p-4 transition-colors hover:border-[var(--color-rule-strong)]">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-[var(--color-ember)]"
              />
              <span className="text-small leading-[1.65] text-[var(--color-text-secondary)]">
                I have the right to use recordings of this person&rsquo;s voice,
                and I&rsquo;m creating this for personal remembrance.{" "}
                <a href="/about" className="underline underline-offset-4 transition hover:text-[var(--color-bone)]">
                  Why we ask
                </a>
              </span>
            </label>

            {whoError ? (
              <p className="text-small text-[var(--color-danger)]" role="alert">
                {whoError}
              </p>
            ) : null}

            <div>
              <Button variant="primary" size="lg" onClick={continueFromWho}>
                Continue
              </Button>
            </div>
          </motion.section>
        ) : null}

        {/* ── Step 2 · About (audio narration) ─────────────────── */}
        {step === "narrate" ? (
          <motion.section
            key="narrate"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
            className="flex flex-1 flex-col"
          >
            <NarrationStep
              name={name.trim()}
              relationship={resolvedRelationship || undefined}
              mode={isSelf ? "self" : "persona"}
              onComplete={(result) => {
                setNarration(result);
                setStep("voice");
              }}
            />
          </motion.section>
        ) : null}

        {/* ── Step 3 · Voice ───────────────────────────────────── */}
        {step === "voice" ? (
          <motion.section
            key="voice"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
            className="flex flex-1 flex-col gap-6"
          >
            <div className="flex flex-col gap-3">
              <h1 className="font-serif text-display leading-[1.08] tracking-[-0.02em] text-balance text-[var(--color-bone)] sm:text-hero">
                Bring {name.trim()}&rsquo;s voice.
              </h1>
            </div>
            <RecordExperience subjectName={name.trim()} onCloned={handleCloned} />
          </motion.section>
        ) : null}

        {/* ── Step 3 · Listen ──────────────────────────────────── */}
        {step === "listen" && clone ? (
          <motion.section
            key="listen"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
            className="flex flex-1 items-start justify-center pt-2 sm:items-center sm:pt-0"
          >
            <ListenStep
              name={name.trim()}
              voiceId={clone.voiceId}
              subjectId={clone.subjectId}
              onAccept={beginTalking}
              onRetry={() => {
                setClone(null);
                setStep("voice");
              }}
            />
          </motion.section>
        ) : null}
      </AnimatePresence>
    </div>
    </main>
    </AppShell>
  );
}

/**
 * Auto-generates the preview and plays it. The primary action is moving
 * forward; re-recording is the quiet path.
 *
 * Exported because the "record a better sample" flow ends in exactly the same
 * question — is this them? — and answering it twice, differently, would be two
 * versions of the most important moment in the product.
 */
export function ListenStep({
  name,
  voiceId,
  subjectId,
  acceptLabel = "That’s them — start talking",
  onAccept,
  onRetry,
}: {
  name: string;
  voiceId: string;
  /** Enables the photo prompt: photos are stored per person id, which only
   *  exists once the clone has created (or updated) their row. */
  subjectId?: string;
  acceptLabel?: string;
  onAccept: () => void;
  onRetry: () => void;
}) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const requestedRef = useRef(false);

  const loadPreview = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/voice-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voiceId, name }),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(json?.error || "Could not generate a preview.");
      }
      const blob = await res.blob();
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(blob);
      });
      trackEvent("voice_preview_generated");
      window.setTimeout(() => void audioRef.current?.play().catch(() => null), 80);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not generate a preview.");
      trackEvent("voice_preview_failed");
    } finally {
      setLoading(false);
    }
  }, [voiceId, name]);

  useEffect(() => {
    if (requestedRef.current) return;
    requestedRef.current = true;
    void loadPreview();
  }, [loadPreview]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  return (
    <div className="w-full max-w-xl">
      <div className="flex flex-col gap-3">
        <h1 className="font-serif text-display leading-[1.08] tracking-[-0.02em] text-balance text-[var(--color-bone)] sm:text-hero">
          This is {name}.
        </h1>
        <p className="text-body leading-[1.7] text-[var(--color-text-secondary)]">
          Listen once. If it sounds like them, start talking — you can refine
          how they speak any time. It will sound like them; it won&rsquo;t
          always <em>be</em> them — that part you shape together, conversation
          by conversation.
        </p>
      </div>

      <div className="mt-8 rounded-2xl border border-[var(--color-rule)] bg-white/[0.02] p-6 sm:p-7">
        {loading ? (
          <div className="flex items-center gap-4 py-3" role="status">
            <span className="relative inline-flex h-2.5 w-2.5">
              <span className="absolute inset-[-6px] animate-ping rounded-full bg-[var(--color-ember)]/30" />
              <span className="relative h-2.5 w-2.5 rounded-full bg-[var(--color-ember)]" />
            </span>
            <p className="text-body text-[var(--color-bone)]/90">
              Generating a first sentence in {name}&rsquo;s voice…
            </p>
          </div>
        ) : error ? (
          <div className="flex flex-col gap-4">
            <p className="text-small leading-[1.6] text-[var(--color-danger)]" role="alert">
              {error}
            </p>
            <Button variant="outline" size="md" onClick={() => void loadPreview()}>
              Try again
            </Button>
          </div>
        ) : previewUrl ? (
          <div className="flex flex-col gap-5">
            <PreviewPlayer src={previewUrl} audioRef={audioRef} name={name} />
            <p className="text-small text-[var(--color-text-tertiary)]">
              Generated from their voice — not the original recording.
            </p>
          </div>
        ) : null}
      </div>

      {/* A face beside the voice.
          Photos have worked since lib/photo existed, but the only way to find
          the feature was to hover an avatar somewhere else in the app, so
          almost nobody did. This is the one moment they are certain to be
          looking at a circle where the face should go — and the first moment a
          person id exists to store it against. Skippable by ignoring it. */}
      {subjectId ? (
        <div className="mt-6 flex items-center gap-4 rounded-2xl border border-[var(--color-rule)] bg-white/[0.02] p-5">
          <PersonAvatar
            id={subjectId}
            seed={`${voiceId}:${name}`}
            size={56}
            initial={name.charAt(0).toUpperCase()}
            animated={false}
            editable
          />
          <div className="flex min-w-0 flex-col gap-1">
            <p className="text-body text-[var(--color-bone)]">Add a photo of {name}</p>
            <p className="text-small leading-[1.6] text-[var(--color-text-secondary)]">
              Tap the circle to choose one. It stays on this device and is never
              uploaded. Optional — you can add one later from their page.
            </p>
          </div>
        </div>
      ) : null}

      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
        <Button
          variant="primary"
          size="lg"
          disabled={!previewUrl}
          onClick={onAccept}
          className="w-full sm:w-auto"
        >
          {acceptLabel}
        </Button>
        <Button variant="ghost" size="md" onClick={onRetry}>
          Try a different recording
        </Button>
      </div>
    </div>
  );
}

/**
 * First hearing of their voice — a crafted player, not the browser default.
 * Play button with a breathing ember glow while speaking, hairline seek bar.
 */
function PreviewPlayer({
  src,
  audioRef,
  name,
}: {
  src: string;
  audioRef: React.RefObject<HTMLAudioElement | null>;
  name: string;
}) {
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onTime = () => setProgress(el.duration ? el.currentTime / el.duration : 0);
    const onMeta = () => setDuration(el.duration || 0);
    const onEnd = () => {
      setPlaying(false);
      setProgress(0);
    };
    el.addEventListener("play", onPlay);
    el.addEventListener("pause", onPause);
    el.addEventListener("timeupdate", onTime);
    el.addEventListener("loadedmetadata", onMeta);
    el.addEventListener("ended", onEnd);
    return () => {
      el.removeEventListener("play", onPlay);
      el.removeEventListener("pause", onPause);
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("loadedmetadata", onMeta);
      el.removeEventListener("ended", onEnd);
    };
  }, [audioRef, src]);

  const toggle = () => {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) void el.play().catch(() => null);
    else el.pause();
  };

  const seek = (value: number) => {
    const el = audioRef.current;
    if (!el || !el.duration) return;
    el.currentTime = (value / 100) * el.duration;
    setProgress(value / 100);
  };

  return (
    <div className="flex items-center gap-5">
      <audio ref={audioRef} src={src} preload="auto" className="hidden" />
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? "Pause" : `Play ${name}'s voice`}
        className="relative grid h-14 w-14 shrink-0 place-items-center rounded-full border border-[var(--color-ember)]/35 bg-[var(--color-ember)]/[0.08] text-[var(--color-bone)] transition-colors duration-300 hover:border-[var(--color-ember)]/60 hover:bg-[var(--color-ember)]/[0.14]"
      >
        {playing ? (
          <span
            className="pointer-events-none absolute inset-[-30%] animate-pulse rounded-full blur-[16px]"
            style={{ background: "radial-gradient(closest-side, rgba(194,120,74,0.4), transparent 75%)" }}
            aria-hidden
          />
        ) : null}
        {playing ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden className="relative">
            <rect x="6" y="5" width="4" height="14" rx="1" />
            <rect x="14" y="5" width="4" height="14" rx="1" />
          </svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden className="relative ml-0.5">
            <path d="M7 4.8v14.4a1 1 0 0 0 1.52.85l11.2-7.2a1 1 0 0 0 0-1.7L8.52 3.95A1 1 0 0 0 7 4.8z" />
          </svg>
        )}
      </button>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <input
          type="range"
          className="range-ember"
          min={0}
          max={100}
          step={0.5}
          value={progress * 100}
          onChange={(e) => seek(Number(e.target.value))}
          aria-label="Seek within the preview"
        />
        <div className="flex justify-between text-micro tabular-nums text-[var(--color-text-tertiary)]">
          <span>{formatSeconds(progress * duration)}</span>
          <span>{formatSeconds(duration)}</span>
        </div>
      </div>
    </div>
  );
}
