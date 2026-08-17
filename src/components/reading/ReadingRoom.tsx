"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { AppShell } from "@/components/shell/AppShell";
import { buttonClasses } from "@/components/ui/buttonClasses";
import { useSession } from "@/lib/session";
import { PlaybackQueue, base64ToArrayBuffer } from "@/lib/audio/playbackQueue";
import { streamReading, ReadingAllowanceError } from "@/lib/streamReading";
import { saveReading, getReadings, deleteReading, type ReadingRecord } from "@/lib/db/readings";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { formatRelativeDay } from "@/lib/utils";
import { MAX_READING_CHARS, readingLength, formatSpokenLength } from "@/lib/readings";
import { trackEvent } from "@/lib/analytics";
import { reportError } from "@/lib/reportError";
import { SESSION_ENDED_MESSAGE, isSessionExpired } from "@/lib/authError";
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
  // Held apart from `error`: what they wrote is safe on screen, and the only
  // useful control is a way back in — not a Read button that will 401 again.
  const [sessionEnded, setSessionEnded] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [library, setLibrary] = useState<ReadingRecord[]>([]);
  const [pendingDelete, setPendingDelete] = useState<ReadingRecord | null>(null);

  const queueRef = useRef<PlaybackQueue | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  // Kept so the whole reading can be downloaded as one file afterwards.
  const clipsRef = useRef<ArrayBuffer[]>([]);
  // Which saved reading is being edited, if any. State rather than a ref:
  // it decides both the highlight in the list and whether a save updates or
  // inserts, and refs may not be read during render.
  const [openId, setOpenId] = useState<string | undefined>(undefined);
  const totalRef = useRef(0);
  // Highest clip index actually enqueued — the one that ends the reading.
  const lastEnqueuedRef = useRef(-1);
  const spokenTotalRef = useRef(0);

  // Built once. Keying this on playbackRate tore the whole AudioContext down
  // mid-reading whenever someone adjusted the listening speed — killing the
  // audio and, because destroy() fires no hooks, leaving the room stuck.
  useEffect(() => {
    const queue = new PlaybackQueue({});
    queueRef.current = queue;
    return () => {
      queue.destroy();
      queueRef.current = null;
    };
  }, []);

  useEffect(() => {
    queueRef.current?.setRate(prefs.playbackRate);
  }, [prefs.playbackRate]);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  // Reloaded by bumping the key rather than calling a setter from the effect
  // body, which would be a synchronous state write inside an effect.
  const [libraryKey, setLibraryKey] = useState(0);
  useEffect(() => {
    let cancelled = false;
    getReadings(subjectId)
      .then((rows) => {
        if (!cancelled) setLibrary(rows);
      })
      .catch((err) => reportError("readings-load", err));
    return () => {
      cancelled = true;
    };
  }, [subjectId, libraryKey]);
  const refreshLibrary = useCallback(() => setLibraryKey((n) => n + 1), []);

  const length = readingLength(script);
  const overLimit = length > MAX_READING_CHARS;
  const canRead = length > 0 && !overLimit && Boolean(person);

  // The words are kept the moment they're read — an hour spent writing a
  // letter must not depend on remembering to press save.
  const persist = useCallback(async () => {
    try {
      const record = await saveReading({
        id: openId,
        content: script,
        subjectId,
      });
      if (record) {
        setOpenId(record.id);
        setSaved(true);
        void refreshLibrary();
      }
    } catch (err) {
      reportError("reading-save", err);
    }
  }, [script, subjectId, openId, refreshLibrary]);

  /** Bring a saved reading back into the field, ready to hear again or edit. */
  const openSaved = (reading: ReadingRecord) => {
    abortRef.current?.abort();
    queueRef.current?.stop();
    setOpenId(reading.id);
    setScript(reading.content);
    setSegments([]);
    setSpokenIndex(-1);
    setNotice(null);
    setError(null);
    setPhase("writing");
    trackEvent("reading_reopened");
  };

  const removeSaved = async (reading: ReadingRecord) => {
    setLibrary((rows) => rows.filter((r) => r.id !== reading.id));
    if (openId === reading.id) setOpenId(undefined);
    try {
      await deleteReading(reading.id);
    } catch (err) {
      reportError("reading-delete", err);
      void refreshLibrary();
    }
  };

  const read = useCallback(async () => {
    if (!person || !canRead) return;
    setError(null);
    setNotice(null);
    setSpokenIndex(-1);
    setSegments([]);
    clipsRef.current = [];
    totalRef.current = 0;
    spokenTotalRef.current = 0;
    lastEnqueuedRef.current = -1;
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
          totalRef.current = event.segments.length;
        } else if (event.type === "audio") {
          const buffer = base64ToArrayBuffer(event.base64);
          clipsRef.current.push(buffer.slice(0));
          if (controller.signal.aborted) return;
          spokenTotalRef.current += 1;
          const index = event.index;
          // The LAST CLIP THAT EXISTS, not the last segment. A line the
          // provider failed on emits a notice and no audio, so pinning the
          // finish to `total - 1` left the room reading "Reading…" in silence
          // for ever whenever the failure happened to be the final line.
          lastEnqueuedRef.current = index;
          // Follow the voice, not the download. Audio for a five-minute
          // reading arrives in seconds; lighting each line on arrival would
          // race the words far ahead of the person speaking them.
          await queueRef.current?.enqueue(buffer, event.pauseMs ?? 0, {
            onStart: () => {
              setPhase("reading");
              setSpokenIndex(index);
            },
            onEnd: () => {
              // Whichever clip turns out to have been the last one enqueued
              // ends the reading, resolved as the stream goes rather than
              // guessed in advance.
              if (index === lastEnqueuedRef.current) setPhase("finished");
            },
          });
        } else if (event.type === "notice") {
          setNotice(event.message);
        } else if (event.type === "error") {
          setError(event.message);
        }
      }
      // The stream ending only means every clip has arrived — the voice is
      // still speaking. "Finished" is set by the last clip's onEnd above.
      // Unless nothing could be spoken at all, in which case nothing will.
      if (spokenTotalRef.current === 0) setPhase("finished");
      trackEvent("reading_finished");
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      if (err instanceof ReadingAllowanceError) {
        setError("You've reached this month's readings. Everything you wrote is saved.");
        setPhase("writing");
        return;
      }
      // A lapsed session is not a reading that failed. Without this the reader
      // was shown the raw "Unauthorized" from the middleware beside a Read
      // button that could only ever 401 again.
      if (isSessionExpired(err)) {
        setSessionEnded(true);
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
              onChange={(e) => {
                const next = e.target.value;
                setScript(next);
                // Emptying the field means a new letter, not a revision of the
                // last one. Without this, clearing it and writing something
                // else would save over the reading you just kept.
                if (!next.trim()) setOpenId(undefined);
              }}
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

            {/* Everything written for this person. Kept from the moment a
                reading starts, so nothing is lost to a closed tab — but that
                only counts for something if you can find it again. */}
            {library.length > 0 ? (
              <section className="mt-10 flex flex-col gap-3">
                <h2 className="text-micro uppercase tracking-[0.14em] text-[var(--color-text-tertiary)]">
                  Written for {personName}
                </h2>
                <div className="flex flex-col gap-1">
                  {library.map((reading) => (
                    <div
                      key={reading.id}
                      className={cn(
                        "group flex items-center rounded-xl pr-1 transition-colors",
                        openId === reading.id
                          ? "bg-white/[0.045]"
                          : "hover:bg-white/[0.025]",
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => openSaved(reading)}
                        className="flex min-h-[60px] min-w-0 flex-1 cursor-pointer flex-col justify-center gap-1 py-2.5 pl-3.5 pr-2 text-left"
                      >
                        <span className="truncate font-serif text-lead leading-snug text-[var(--color-bone)]">
                          {reading.title}
                        </span>
                        <span className="text-micro text-[var(--color-text-tertiary)]">
                          {formatRelativeDay(reading.updatedAt)} ·{" "}
                          {formatSpokenLength(reading.content)}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setPendingDelete(reading)}
                        aria-label={`Delete “${reading.title}”`}
                        className="flex h-11 w-10 shrink-0 cursor-pointer items-center justify-center rounded-lg text-[var(--color-text-tertiary)] transition hover:text-[var(--color-danger)]"
                      >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                          <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-.8 14.2a1 1 0 0 1-1 .8H6.8a1 1 0 0 1-1-.8L5 6" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}
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
                  animate={{ opacity: i <= spokenIndex ? 1 : 0.4 }}
                  transition={{ duration: 0.5 }}
                  className={cn(
                    "font-serif text-title leading-[1.55] text-balance transition-colors duration-500",
                    // Words already spoken stay lit — they have been said, and
                    // dimming them again left a finished reading looking
                    // entirely unread. Only what is still to come waits.
                    i < spokenIndex
                      ? "text-[var(--color-bone-dim)]"
                      : i === spokenIndex
                        ? "text-[var(--color-bone)]"
                        : "text-[var(--color-text-tertiary)]",
                  )}
                >
                  {line}
                </motion.p>
              ))
            )}
          </div>
        )}

        {sessionEnded ? (
          <div role="alert" className="mt-4 flex flex-wrap items-center gap-3">
            <p className="text-small text-[var(--color-bone)]/90">{SESSION_ENDED_MESSAGE}</p>
            <Link
              href={`/auth/login?next=/people/${subjectId}/reading`}
              className={buttonClasses({ variant: "outline", size: "md", className: "px-4 text-small" })}
            >
              Sign in again
            </Link>
          </div>
        ) : error ? (
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

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete this reading?"
        body={`"${pendingDelete?.title ?? ""}" will be permanently removed. The recording you kept stays on your device.`}
        confirmLabel="Delete reading"
        onConfirm={() => {
          if (pendingDelete) void removeSaved(pendingDelete);
          setPendingDelete(null);
        }}
        onCancel={() => setPendingDelete(null)}
      />
    </AppShell>
  );
}

