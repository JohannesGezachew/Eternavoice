"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Waveform } from "./Waveform";
import { Script } from "./Script";
import { QualityHint } from "./QualityHint";
import { RecordControl } from "./RecordControl";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Field";
import { startRecording, type ActiveRecorder } from "@/lib/audio/recorder";
import {
  classifyQuality,
  makeQualityState,
  type QualityState,
  type QualityVerdict,
} from "@/lib/audio/quality";
import {
  SCRIPT_MAX_SECONDS,
  SCRIPT_MIN_SECONDS,
  SCRIPT_TARGET_SECONDS,
} from "@/lib/clone/script";
import { useSession } from "@/lib/session";
import { fadeUp, stagger } from "@/lib/motion";
import { cn, formatSeconds } from "@/lib/utils";

type Phase = "intro" | "recording" | "review" | "uploading" | "ready";
type Mode = "upload" | "record";

interface Take {
  blob: Blob;
  mimeType: string;
  durationMs: number;
  url: string;
}

export function RecordExperience() {
  const router = useRouter();
  const setVoice = useSession((s) => s.setVoice);
  const existingVoice = useSession((s) => s.voiceId);

  const [mode, setMode] = useState<Mode>("upload");
  const [phase, setPhase] = useState<Phase>("intro");
  const [name, setName] = useState("");
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Record-mode state
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [verdict, setVerdict] = useState<QualityVerdict>("warming");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [take, setTake] = useState<Take | null>(null);
  const [data, setData] = useState<Uint8Array | null>(null);
  const recorderRef = useRef<ActiveRecorder | null>(null);
  const qualityRef = useRef<QualityState>(makeQualityState());

  // Upload-mode state
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadPreviewUrl, setUploadPreviewUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      recorderRef.current?.cancel();
      if (take) URL.revokeObjectURL(take.url);
      if (uploadPreviewUrl) URL.revokeObjectURL(uploadPreviewUrl);
    };
  }, [take, uploadPreviewUrl]);

  const switchMode = useCallback(
    (m: Mode) => {
      if (m === mode) return;
      setMode(m);
      setPhase("intro");
      setUploadError(null);
      setPermissionError(null);
    },
    [mode],
  );

  // ── Upload handlers ────────────────────────────────────────────────────────

  const acceptFile = useCallback(
    (file: File) => {
      if (uploadPreviewUrl) URL.revokeObjectURL(uploadPreviewUrl);
      setUploadFile(file);
      setUploadPreviewUrl(URL.createObjectURL(file));
      setUploadError(null);
      setPhase("review");
    },
    [uploadPreviewUrl],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) acceptFile(file);
    },
    [acceptFile],
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) acceptFile(file);
      e.target.value = "";
    },
    [acceptFile],
  );

  const retakeUpload = useCallback(() => {
    if (uploadPreviewUrl) URL.revokeObjectURL(uploadPreviewUrl);
    setUploadFile(null);
    setUploadPreviewUrl(null);
    setUploadError(null);
    setPhase("intro");
  }, [uploadPreviewUrl]);

  const submitUpload = useCallback(async () => {
    if (!uploadFile) return;
    setUploadError(null);
    setPhase("uploading");
    try {
      const fd = new FormData();
      fd.append("audio", uploadFile);
      fd.append("name", name.trim() || "EternaVoice subject");
      const res = await fetch("/api/clone", { method: "POST", body: fd });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error((json as { error?: string }).error || "Could not create the clone.");
      }
      const json = (await res.json()) as { voiceId: string; name: string };
      setVoice(json.voiceId, json.name);
      setPhase("ready");
      setTimeout(() => router.push("/persona"), 1100);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong.";
      setUploadError(message);
      setPhase("review");
    }
  }, [uploadFile, name, router, setVoice]);

  // ── Record handlers ────────────────────────────────────────────────────────

  const start = useCallback(async () => {
    setPermissionError(null);
    qualityRef.current = makeQualityState();
    setVerdict("warming");
    setElapsedMs(0);
    try {
      const recorder = await startRecording({
        autoGainControl: false,
        onLevel: (rms, peak) => {
          qualityRef.current = (() => {
            const next = qualityRef.current;
            return {
              rmsAvg: next.rmsAvg * 0.92 + rms * 0.08,
              peakMax: Math.max(next.peakMax * 0.992, peak),
              rmsBaseline:
                next.framesSinceStart < 60
                  ? next.rmsBaseline * 0.6 + rms * 0.4
                  : next.rmsBaseline,
              framesSinceStart: next.framesSinceStart + 1,
            };
          })();
          setVerdict(classifyQuality(qualityRef.current));
        },
        onTimeData: (d) => setData(new Uint8Array(d)),
        onTick: (ms) => setElapsedMs(ms),
      });
      recorderRef.current = recorder;
      setPhase("recording");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Microphone permission was denied.";
      setPermissionError(message);
    }
  }, []);

  const stop = useCallback(async () => {
    const recorder = recorderRef.current;
    if (!recorder) return;
    try {
      const result = await recorder.stop();
      recorderRef.current = null;
      const url = URL.createObjectURL(result.blob);
      setTake({ ...result, url });
      setPhase("review");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Recording failed unexpectedly.";
      setPermissionError(message);
      recorderRef.current = null;
      setPhase("intro");
    }
  }, []);

  const retake = useCallback(() => {
    if (take) URL.revokeObjectURL(take.url);
    setTake(null);
    setData(null);
    setUploadError(null);
    setPhase("intro");
  }, [take]);

  const submit = useCallback(async () => {
    if (!take) return;
    setUploadError(null);
    setPhase("uploading");
    try {
      const fileExt = take.mimeType.includes("mp4")
        ? "mp4"
        : take.mimeType.includes("mpeg")
          ? "mp3"
          : "webm";
      const file = new File([take.blob], `voice-sample.${fileExt}`, {
        type: take.mimeType,
      });
      const fd = new FormData();
      fd.append("audio", file);
      fd.append("name", name.trim() || "EternaVoice subject");
      const res = await fetch("/api/clone", { method: "POST", body: fd });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Could not create the clone.");
      }
      const json = (await res.json()) as { voiceId: string; name: string };
      setVoice(json.voiceId, json.name);
      setPhase("ready");
      setTimeout(() => router.push("/persona"), 1100);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Something went wrong on our side.";
      setUploadError(message);
      setPhase("review");
    }
  }, [take, name, router, setVoice]);

  const elapsedSeconds = elapsedMs / 1000;
  const overshoot = elapsedSeconds > SCRIPT_MAX_SECONDS;
  const undershoot = elapsedSeconds > 0 && elapsedSeconds < SCRIPT_MIN_SECONDS;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-6 pt-4 pb-16 sm:px-8">
      <motion.header
        initial="initial"
        animate="enter"
        variants={stagger(0.05)}
        className="flex flex-col gap-3"
      >
        <motion.p
          variants={fadeUp}
          className="text-[12px] tracking-[0.22em] text-[var(--color-bone-dim)] uppercase"
        >
          Step one · Voice
        </motion.p>
        <motion.h1
          variants={fadeUp}
          className="font-serif text-[34px] leading-[1.08] tracking-[-0.02em] text-balance text-[var(--color-bone)] sm:text-[44px]"
        >
          {mode === "upload" ? (
            <>
              Bring their voice.
              <br />
              <span className="italic text-[var(--color-bone)]/80">
                Drop what you have.
              </span>
            </>
          ) : (
            <>
              Read this slowly.
              <br />
              <span className="italic text-[var(--color-bone)]/80">
                The way you would tell it.
              </span>
            </>
          )}
        </motion.h1>
        <motion.p
          variants={fadeUp}
          className="max-w-xl text-[15px] leading-[1.7] text-[var(--color-bone)]/65"
        >
          {mode === "upload"
            ? "A voicemail, voice note, or video clip. A few minutes is enough — the more natural the speech, the richer it becomes."
            : "Around seventy-five seconds is enough. Don't perform — just read. The recording stays on this device until you choose to make the clone."}
        </motion.p>

        <motion.div variants={fadeUp} className="mt-1 flex items-center gap-3">
          <button
            type="button"
            onClick={() => switchMode("upload")}
            className={cn(
              "text-[13px] transition-colors",
              mode === "upload"
                ? "text-[var(--color-bone)]"
                : "text-[var(--color-bone-dim)] hover:text-[var(--color-bone)]/70",
            )}
          >
            Upload a file
          </button>
          <span className="text-[var(--color-bone-dim)]/30">·</span>
          <button
            type="button"
            onClick={() => switchMode("record")}
            className={cn(
              "text-[13px] transition-colors",
              mode === "record"
                ? "text-[var(--color-bone)]"
                : "text-[var(--color-bone-dim)] hover:text-[var(--color-bone)]/70",
            )}
          >
            Record instead
          </button>
        </motion.div>
      </motion.header>

      <div className="mt-10 grid flex-1 gap-10 lg:grid-cols-[1.15fr_0.85fr] lg:gap-14">
        {/* Left panel */}
        <section className="relative">
          {mode === "upload" ? (
            <AnimatePresence mode="wait">
              {phase === "intro" || phase === "review" ? (
                <motion.div
                  key="dropzone"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.35 }}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="audio/*,video/mp4"
                    className="hidden"
                    onChange={handleFileInput}
                  />
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      setIsDragging(true);
                    }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={cn(
                      "flex min-h-[300px] cursor-pointer flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed p-10 text-center transition-all duration-200",
                      isDragging
                        ? "border-[var(--color-ember)]/50 bg-[var(--color-ember)]/[0.04]"
                        : "border-[var(--color-rule-strong)] hover:border-[var(--color-ember)]/25 hover:bg-white/[0.015]",
                    )}
                  >
                    {uploadFile ? (
                      <>
                        <span className="inline-flex h-2 w-2 rounded-full bg-[var(--color-ember)]" />
                        <p className="max-w-[220px] break-words text-[15px] text-[var(--color-bone)]/90">
                          {uploadFile.name}
                        </p>
                        <p className="text-[13px] text-[var(--color-bone-dim)]">
                          {(uploadFile.size / 1024 / 1024).toFixed(1)} MB
                        </p>
                        <p className="text-[12px] text-[var(--color-bone-dim)]/50">
                          Click to choose a different file
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="text-[16px] text-[var(--color-bone)]/80">
                          Drop a voice file here
                        </p>
                        <p className="max-w-[260px] text-[13px] leading-[1.65] text-[var(--color-bone-dim)]">
                          Voicemails, voice notes, videos — any recording with their voice
                        </p>
                        <p className="text-[11px] tracking-[0.14em] text-[var(--color-bone-dim)]/50 uppercase">
                          mp3 · mp4 · m4a · wav · ogg
                        </p>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            fileInputRef.current?.click();
                          }}
                          className="mt-1 rounded-xl border border-[var(--color-rule-strong)] px-5 py-2 text-[13px] text-[var(--color-bone)]/60 transition-colors hover:text-[var(--color-bone)]"
                        >
                          Browse files
                        </button>
                      </>
                    )}
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>
          ) : (
            <div className="hairline rounded-2xl bg-white/[0.015] p-7 sm:p-9">
              <Script active={phase === "recording"} />
            </div>
          )}
        </section>

        {/* Right panel */}
        <aside className="flex flex-col gap-6">
          {mode === "record" ? (
            <div className="hairline relative overflow-hidden rounded-2xl bg-white/[0.02] p-7 sm:p-9">
              <Waveform
                active={phase === "recording"}
                data={data}
                className="block h-28 w-full"
              />
              <div className="mt-5 flex items-center justify-between text-[12px] tracking-[0.18em] text-[var(--color-bone-dim)] uppercase">
                <span>{phase === "recording" ? "Recording" : "Microphone"}</span>
                <span
                  className={
                    overshoot
                      ? "text-[var(--color-bone-2)]"
                      : "text-[var(--color-bone)]/70"
                  }
                >
                  {formatSeconds(elapsedSeconds)} / {formatSeconds(SCRIPT_TARGET_SECONDS)}
                </span>
              </div>
              <div className="mt-4 min-h-6">
                <QualityHint verdict={verdict} />
              </div>
            </div>
          ) : null}

          <AnimatePresence mode="wait">
            {/* Upload intro: name input + hint */}
            {mode === "upload" && phase === "intro" ? (
              <motion.div
                key="upload-intro"
                variants={fadeUp}
                initial="initial"
                animate="enter"
                exit="exit"
                className="hairline rounded-2xl bg-white/[0.015] p-7 sm:p-9"
              >
                <div className="space-y-5">
                  <div>
                    <Label htmlFor="upload-name" hint="optional">
                      Whose voice is this
                    </Label>
                    <Input
                      id="upload-name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Their name"
                      autoComplete="off"
                      maxLength={60}
                    />
                  </div>
                  <p className="text-[13px] text-[var(--color-bone-dim)]">
                    Drop a file on the left to continue.
                  </p>
                  {existingVoice ? (
                    <p className="text-[12px] text-[var(--color-bone-dim)]">
                      A voice from this session already exists. Uploading again will replace it.
                    </p>
                  ) : null}
                </div>
              </motion.div>
            ) : null}

            {/* Upload review: preview + submit */}
            {mode === "upload" && phase === "review" ? (
              <motion.div
                key="upload-review"
                variants={fadeUp}
                initial="initial"
                animate="enter"
                exit="exit"
                className="hairline rounded-2xl bg-white/[0.015] p-7 sm:p-9"
              >
                <div className="space-y-5">
                  <div>
                    <Label htmlFor="upload-name-r" hint="optional">
                      Whose voice is this
                    </Label>
                    <Input
                      id="upload-name-r"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Their name"
                      autoComplete="off"
                      maxLength={60}
                    />
                  </div>
                  {uploadPreviewUrl ? (
                    <audio
                      src={uploadPreviewUrl}
                      controls
                      preload="metadata"
                      className="w-full"
                    />
                  ) : null}
                  <div className="flex flex-wrap items-center gap-3">
                    <Button variant="primary" size="md" onClick={submitUpload}>
                      Make the clone
                    </Button>
                    <Button variant="outline" size="md" onClick={retakeUpload}>
                      Choose different
                    </Button>
                  </div>
                  {uploadError ? (
                    <p className="text-[13px] text-[var(--color-ember-soft)]">
                      {uploadError}
                    </p>
                  ) : null}
                </div>
              </motion.div>
            ) : null}

            {/* Record intro */}
            {mode === "record" && phase === "intro" ? (
              <motion.div
                key="rec-intro"
                variants={fadeUp}
                initial="initial"
                animate="enter"
                exit="exit"
                className="hairline rounded-2xl bg-white/[0.015] p-7 sm:p-9"
              >
                <div className="space-y-5">
                  <div>
                    <Label htmlFor="subject-name" hint="optional">
                      Whose voice is this
                    </Label>
                    <Input
                      id="subject-name"
                      placeholder="A name, or just yours"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      autoComplete="off"
                      maxLength={60}
                    />
                  </div>
                  <div className="flex items-center justify-between gap-6">
                    <RecordControl state="idle" onClick={start} label="Tap to begin" />
                    <p className="max-w-[200px] text-right text-[12px] leading-[1.6] text-[var(--color-bone-dim)]">
                      We'll ask the browser for the microphone, then you can read.
                    </p>
                  </div>
                  {permissionError ? (
                    <p className="text-[13px] text-[var(--color-ember-soft)]">
                      {permissionError}
                    </p>
                  ) : null}
                  {existingVoice ? (
                    <p className="text-[12px] text-[var(--color-bone-dim)]">
                      A voice from this session already exists. Recording again will replace it.
                    </p>
                  ) : null}
                </div>
              </motion.div>
            ) : null}

            {/* Record recording */}
            {mode === "record" && phase === "recording" ? (
              <motion.div
                key="rec-recording"
                variants={fadeUp}
                initial="initial"
                animate="enter"
                exit="exit"
                className="hairline rounded-2xl bg-white/[0.015] p-7 sm:p-9"
              >
                <div className="flex items-center justify-between gap-6">
                  <RecordControl
                    state="recording"
                    onClick={stop}
                    label={overshoot ? "Wrap up" : "Tap to stop"}
                  />
                  <p className="max-w-[220px] text-right text-[12px] leading-[1.6] text-[var(--color-bone-dim)]">
                    Read at a natural pace. Pauses are fine — they help.
                  </p>
                </div>
              </motion.div>
            ) : null}

            {/* Record review */}
            {mode === "record" && phase === "review" && take ? (
              <motion.div
                key="rec-review"
                variants={fadeUp}
                initial="initial"
                animate="enter"
                exit="exit"
                className="hairline rounded-2xl bg-white/[0.015] p-7 sm:p-9"
              >
                <div className="space-y-5">
                  <p className="text-[14px] text-[var(--color-bone)]/85">
                    Listen back before we lift the clone.
                    {undershoot ? " A touch short — another twenty seconds will help realism." : ""}
                  </p>
                  <audio
                    src={take.url}
                    controls
                    preload="metadata"
                    className="w-full"
                  />
                  <div className="flex flex-wrap items-center gap-3">
                    <Button variant="primary" size="md" onClick={submit}>
                      Make the clone
                    </Button>
                    <Button variant="outline" size="md" onClick={retake}>
                      Record again
                    </Button>
                  </div>
                  {uploadError ? (
                    <p className="text-[13px] text-[var(--color-ember-soft)]">
                      {uploadError}
                    </p>
                  ) : null}
                </div>
              </motion.div>
            ) : null}

            {/* Shared: uploading */}
            {phase === "uploading" ? (
              <motion.div
                key="uploading"
                variants={fadeUp}
                initial="initial"
                animate="enter"
                exit="exit"
                className="hairline rounded-2xl bg-white/[0.015] p-7 sm:p-9"
              >
                <div className="flex items-center gap-4">
                  <span className="relative inline-flex h-2 w-2">
                    <span className="absolute inset-[-6px] animate-ping rounded-full bg-[var(--color-ember)]/30" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--color-ember)]" />
                  </span>
                  <p className="text-[14px] text-[var(--color-bone)]/85">
                    Lifting the clone. A few seconds.
                  </p>
                </div>
              </motion.div>
            ) : null}

            {/* Shared: ready */}
            {phase === "ready" ? (
              <motion.div
                key="ready"
                variants={fadeUp}
                initial="initial"
                animate="enter"
                exit="exit"
                className="hairline rounded-2xl bg-white/[0.015] p-7 sm:p-9"
              >
                <div className="flex items-center gap-4">
                  <span className="inline-flex h-2 w-2 rounded-full bg-[var(--color-ember)]" />
                  <p className="text-[14px] text-[var(--color-bone)]/85">
                    The voice is ready. Taking you in.
                  </p>
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </aside>
      </div>
    </div>
  );
}
