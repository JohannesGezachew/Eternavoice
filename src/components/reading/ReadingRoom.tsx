"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AppShell } from "@/components/shell/AppShell";
import { buttonClasses } from "@/components/ui/buttonClasses";
import { useSession } from "@/lib/session";
import { PlaybackQueue, base64ToArrayBuffer } from "@/lib/audio/playbackQueue";
import { streamReading, ReadingAllowanceError } from "@/lib/streamReading";
import { saveReading } from "@/lib/db/readings";
import { MAX_READING_CHARS, readingLength, formatSpokenLength } from "@/lib/readings";
import { trackEvent } from "@/lib/analytics";
import { reportError } from "@/lib/reportError";
import { haptic } from "@/lib/haptics";
import { saveChime } from "@/lib/sound";
import { cn } from "@/lib/utils";

type Phase = "writing" | "preparing" | "reading" | "finished";

/**
 * Something you wrote, in their voice.
 *
 * The one place in the app where no model touches the words. A conversation
 * reply is shortened, de-exclaimed and given fillers to sound spontaneous;
 * here every character is spoken exactly as typed, because it is a letter
 * someone wrote and the whole point is that nothing rewrites it.
 */
export function ReadingRoom({ subjectId }: { subjectId: string }) {
  const voices = useSession((s) => s.voices);
  const prefs = useSession((s) => s.prefs);

  const person = useMemo(
    () => voices.find((v) => v.subjectId === subjectId) ?? null,
    [voices, subjectId],
  );
  const personName = person?.name?.trim() || "them";

  const [script, setScript] = useState("");
  const [phase, setPhase] = useState<Phase>("writing");
  const [segments, setSegments] = useState<string[]>([]);
  const [spokenIndex, setSpokenIndex] = useState(-1);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const queueRef = useRef<PlaybackQueue | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  // Kept so the whole reading can be downloaded as one file afterwards.
  const clipsRef = useRef<ArrayBuffer[]>([]);
  const savedIdRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    const queue = new PlaybackQueue({});
    queue.setRate(prefs.playbackRate);
    queueRef.current = queue;
    return () => {
      queue.destroy();
      queueRef.current = null;
    };
  }, [prefs.playbackRate]);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const length = readingLength(script);
  const overLimit = length > MAX_READING_CHARS;
  const canRead = length > 0 && !overLimit && Boolean(person);

  // The words are kept the moment they're read — an hour spent writing a
  // letter must not depend on remembering to press save.
  const persist = useCallback(async () => {
    try {
      const record = await saveReading({
        id: savedIdRef.current,
        content: script,
        subjectId,
      });
      if (record) {
        savedIdRef.current = record.id;
        setSaved(true);
      }
    } catch (err) {
      reportError("reading-save", err);
    }
  }, [script, subjectId]);

  const read = useCallback(async () => {
    if (!person || !canRead) return;
    setError(null);
    setNotice(null);
    setSpokenIndex(-1);
    setSegments([]);
    clipsRef.current = [];
    setPhase("preparing");
    haptic("begin");
    trackEvent("reading_started", { chars: length });

    void persist();

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      await queueRef.current?.unlock();
      queueRef.current?.stop();

      for await (const event of streamReading(
        { voiceId: person.id, script },
        controller.signal,
      )) {
        if (event.type === "ready") {
          setSegments(event.segments);
        } else if (event.type === "audio") {
          const buffer = base64ToArrayBuffer(event.base64);
          clipsRef.current.push(buffer.slice(0));
          if (phaseIsStale(controller)) return;
          setPhase("reading");
          // Light the line as it is scheduled — the queue plays gaplessly, so
          // this tracks the read closely enough to follow along.
          setSpokenIndex(event.index);
          await queueRef.current?.enqueue(buffer, event.pauseMs ?? 0);
        } else if (event.type === "notice") {
          setNotice(event.message);
        } else if (event.type === "error") {
          setError(event.message);
        }
      }
      setPhase("finished");
      trackEvent("reading_finished");
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      if (err instanceof ReadingAllowanceError) {
        setError("You've reached this month's readings. Everything you wrote is saved.");
        setPhase("writing");
        return;
      }
      reportError("reading-stream", err);
      setError(err instanceof Error ? err.message : "The reading didn't finish.");
      setPhase("writing");
    } finally {
      abortRef.current = null;
    }
  }, [person, canRead, script, length, persist]);

  const stop = () => {
    abortRef.current?.abort();
    queueRef.current?.stop();
    setPhase(segments.length ? "finished" : "writing");
  };

  const startOver = () => {
    abortRef.current?.abort();
    queueRef.current?.stop();
    setPhase("writing");
    setSegments([]);
    setSpokenIndex(-1);
    setNotice(null);
    setError(null);
  };

  const download = () => {
    if (!clipsRef.current.length) return;
    const blob = new Blob(
      clipsRef.current.map((b) => new Uint8Array(b)),
      { type: "audio/mpeg" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${personName} — a reading.mp3`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 5000);
    saveChime();
    haptic("save");
    trackEvent("reading_downloaded");
  };

  return (
    <AppShell title="A reading" backHref={`/people/${subjectId}`} backLabel={personName} showTabs={false}>
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-6 pb-32 pt-8 sm:px-8">
        <header className="flex flex-col gap-1.5 pb-6">
          <h1 className="font-serif text-display leading-tight tracking-[-0.02em] text-[var(--color-bone)]">
            Have {personName} read something
          </h1>
          <p className="text-body leading-[1.7] text-[var(--color-text-secondary)]">
            A letter, a poem, the thing you never got to say. Written by you, spoken
            exactly as you wrote it.
          </p>
        </header>

        {phase === "writing" ? (
          <>
            <textarea
              value={script}
              onChange={(e) => setScript(e.target.value)}
              rows={14}
              placeholder={`Dear ${personName},\n\n`}
              aria-label="What they should read"
              className="hairline w-full resize-none rounded-2xl bg-white/[0.02] px-5 py-4 font-serif text-lead leading-[1.7] text-[var(--color-bone)] transition placeholder:text-[var(--color-text-tertiary)] focus:border-[var(--color-ember)]/35 focus:outline-none"
            />
            <div className="mt-2 flex items-center justify-between text-small">
              <span className={cn(overLimit ? "text-[var(--color-danger)]" : "text-[var(--color-text-tertiary)]")}>
                {length > 0
                  ? overLimit
                    ? `${length.toLocaleString()} characters — ${(length - MAX_READING_CHARS).toLocaleString()} too many`
                    : `${formatSpokenLength(script)} to hear`
                  : "Blank lines become pauses."}
              </span>
              <span className="text-[var(--color-text-tertiary)]">
                {length.toLocaleString()} / {MAX_READING_CHARS.toLocaleString()}
              </span>
            </div>
          </>
        ) : (
          /* The script, lighting up line by line as it is spoken. Watching your
             own words arrive in their voice is the whole feature. */
          <div className="flex flex-col gap-3" aria-live="polite">
            {segments.length === 0 ? (
              <p className="py-10 text-center text-body text-[var(--color-text-tertiary)]">
                A breath, and they begin.
              </p>
            ) : (
              segments.map((line, i) => (
                <motion.p
                  key={i}
                  initial={false}
                  animate={{ opacity: i <= spokenIndex ? 1 : 0.35 }}
                  transition={{ duration: 0.5 }}
                  className={cn(
                    "font-serif text-title leading-[1.55] text-balance transition-colors duration-500",
                    i === spokenIndex
                      ? "text-[var(--color-bone)]"
                      : "text-[var(--color-bone-dim)]",
                  )}
                >
                  {line}
                </motion.p>
              ))
            )}
          </div>
        )}

        {error ? (
          <p role="alert" className="mt-4 text-small text-[var(--color-danger)]">
            {error}
          </p>
        ) : notice ? (
          <p role="status" className="mt-4 text-small text-[var(--color-text-tertiary)]">
            {notice}
          </p>
        ) : null}

        {!person ? (
          <p className="mt-4 text-small text-[var(--color-text-tertiary)]">
            This person doesn&rsquo;t have a voice yet.
          </p>
        ) : null}
      </div>

      {/* Actions, always reachable. */}
      <div
        className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--color-rule)] bg-[var(--color-ink-2)]/95 backdrop-blur-xl"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="mx-auto flex w-full max-w-2xl items-center justify-between gap-4 px-6 py-3 sm:px-8">
          <span className="text-small text-[var(--color-text-tertiary)]">
            <AnimatePresence mode="wait">
              <motion.span
                key={phase + String(saved)}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                {phase === "preparing"
                  ? "Finding their voice…"
                  : phase === "reading"
                    ? "Reading…"
                    : phase === "finished"
                      ? "That's all of it."
                      : saved
                        ? "Saved"
                        : ""}
              </motion.span>
            </AnimatePresence>
          </span>

          <div className="flex items-center gap-2">
            {phase === "finished" ? (
              <>
                <button
                  type="button"
                  onClick={startOver}
                  className={buttonClasses({ variant: "outline", size: "md" })}
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={download}
                  className={buttonClasses({ size: "md" })}
                >
                  Keep the recording
                </button>
              </>
            ) : phase === "writing" ? (
              <button
                type="button"
                onClick={() => void read()}
                disabled={!canRead}
                className={buttonClasses({ size: "md" })}
              >
                Hear it
              </button>
            ) : (
              <button
                type="button"
                onClick={stop}
                className={buttonClasses({ variant: "outline", size: "md" })}
              >
                Stop
              </button>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}

/** True once this run has been superseded or cancelled. */
function phaseIsStale(controller: AbortController): boolean {
  return controller.signal.aborted;
}
