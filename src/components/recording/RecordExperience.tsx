"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { AnimatePresence, motion } from "framer-motion";
import { Waveform } from "./Waveform";
import { Script } from "./Script";
import { QualityHint } from "./QualityHint";
import { RecordControl } from "./RecordControl";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Field";
import { startRecording, type ActiveRecorder } from "@/lib/audio/recorder";
import { clipAudio } from "@/lib/audio/clipAudio";
import { needsConversion } from "@/lib/audio/convertAudio";

const AudioClipper = dynamic(
  () => import("./AudioClipper").then((m) => m.AudioClipper),
  { ssr: false },
);
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

type Phase = "intro" | "recording" | "review" | "converting" | "uploading" | "ready";
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
  const [uploadDuration, setUploadDuration] = useState(0);
  const [conversionProgress, setConversionProgress] = useState(0);
  const [selectedRegion, setSelectedRegion] = useState<{ start: number; end: number } | null>(null);
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
      setSelectedRegion(null);
      setUploadDuration(0);
      setConversionProgress(0);
    },
    [mode],
  );

  // ── Upload handlers ────────────────────────────────────────────────────────

  const acceptFile = useCallback(
    async (file: File) => {
      setUploadError(null);

      if (needsConversion(file)) {
        setConversionProgress(0);
        setPhase("converting");
        try {
          const { convertToMp3 } = await import("@/lib/audio/convertAudio");
          const converted = await convertToMp3(file, setConversionProgress);
          if (uploadPreviewUrl) URL.revokeObjectURL(uploadPreviewUrl);
          setUploadFile(converted);
          setUploadPreviewUrl(URL.createObjectURL(converted));
          setPhase("review");
        } catch {
          setUploadError("Couldn't convert that file. Try exporting it as mp3 or m4a first.");
          setPhase("intro");
        }
        return;
      }

      if (uploadPreviewUrl) URL.revokeObjectURL(uploadPreviewUrl);
      setUploadFile(file);
      setUploadPreviewUrl(URL.createObjectURL(file));
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
    setSelectedRegion(null);
    setUploadDuration(0);
    setConversionProgress(0);
    setPhase("intro");
  }, [uploadPreviewUrl]);

  const submitUpload = useCallback(async () => {
    if (!uploadFile) return;
    setUploadError(null);
    setPhase("uploading");
    try {
      const fd = new FormData();
      if (selectedRegion) {
        try {
          const clipped = await clipAudio(uploadFile, selectedRegion.start, selectedRegion.end);
          fd.append("audio", new File([clipped], "clip.wav", { type: "audio/wav" }));
        } catch {
          fd.append("audio", uploadFile);
        }
      } else {
        fd.append("audio", uploadFile);
      }
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
  }, [uploadFile, selectedRegion, name, router, setVoice]);

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
        {/* Always-mounted hidden file input — kept outside AnimatePresence so the ref is never null */}
        {mode === "upload" ? (
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*,video/*,.m4a,.aac,.mov,.avi,.mkv,.wmv"
            className="hidden"
            onChange={handleFileInput}
          />
        ) : null}

        {/* Left panel */}
        <section className="relative">
          {mode === "upload" ? (
            <AnimatePresence mode="wait">
              {/* Dropzone — only in intro phase */}
              {phase === "intro" ? (
                <motion.div
                  key="dropzone"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.35 }}
                >
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
                    <p className="text-[16px] text-[var(--color-bone)]/80">
                      Drop a voice file here
                    </p>
                    <p className="max-w-[260px] text-[13px] leading-[1.65] text-[var(--color-bone-dim)]">
                      Voicemails, voice notes, videos — any recording with their voice
                    </p>
                    <p className="text-[11px] tracking-[0.14em] text-[var(--color-bone-dim)]/50 uppercase">
                      mp3 · mp4 · m4a · wav · mov · ogg · and more
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
                  </div>
                </motion.div>
              ) : null}

              {/* Converting — while ffmpeg is running */}
              {phase === "converting" ? (
                <motion.div
                  key="converting"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.35 }}
                >
                  <div className="flex min-h-[300px] flex-col items-center justify-center gap-5 rounded-2xl border-2 border-dashed border-[var(--color-rule-strong)] p-10 text-center">
                    <span className="relative inline-flex h-2.5 w-2.5">
                      <span className="absolute inset-[-6px] animate-ping rounded-full bg-[var(--color-ember)]/30" />
                      <span className="relative h-2.5 w-2.5 rounded-full bg-[var(--color-ember)]" />
                    </span>
                    <div className="space-y-1">
                      <p className="text-[15px] text-[var(--color-bone)]/85">
                        Converting to audio…
                      </p>
                      <p className="text-[13px] text-[var(--color-bone-dim)]">
                        Extracting the voice from your file.
                      </p>
                    </div>
                    {conversionProgress > 0 ? (
                      <div className="w-full max-w-[180px] space-y-1.5">
                        <div className="h-[2px] w-full overflow-hidden rounded-full bg-white/[0.06]">
                          <div
                            className="h-full rounded-full bg-[var(--color-ember)] transition-all duration-300 ease-out"
                            style={{ width: `${conversionProgress}%` }}
                          />
                        </div>
                        <p className="text-[11px] text-[var(--color-bone-dim)]/50">
                          {conversionProgress}%
                        </p>
                      </div>
                    ) : null}
                  </div>
                </motion.div>
              ) : null}

              {/* Waveform — only in review phase */}
              {phase === "review" && uploadPreviewUrl ? (
                <motion.div
                  key="waveform"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.35 }}
                  className="space-y-3"
                >
                  <AudioClipper
                    url={uploadPreviewUrl}
                    showNudge={uploadDuration > 120}
                    onDurationReady={(d) => setUploadDuration(d)}
                    onRegionChange={(r) => setSelectedRegion(r)}
                  />
                  <div className="flex items-center justify-between px-1">
                    <p className="text-[12px] text-[var(--color-bone-dim)]/60 truncate max-w-[180px]">
                      {uploadFile?.name}
                    </p>
                    <button
                      type="button"
                      onClick={retakeUpload}
                      className="text-[12px] text-[var(--color-bone-dim)]/50 transition-colors hover:text-[var(--color-bone-dim)] shrink-0"
                    >
                      Choose different
                    </button>
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
            {/* Upload converting */}
            {mode === "upload" && phase === "converting" ? (
              <motion.div
                key="upload-converting"
                variants={fadeUp}
                initial="initial"
                animate="enter"
                exit="exit"
                className="hairline rounded-2xl bg-white/[0.015] p-7 sm:p-9"
              >
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="upload-name-c" hint="optional">
                      Whose voice is this
                    </Label>
                    <Input
                      id="upload-name-c"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Their name"
                      autoComplete="off"
                      maxLength={60}
                    />
                  </div>
                  <p className="text-[13px] text-[var(--color-bone-dim)]">
                    Hold on — converting your file to audio.
                  </p>
                </div>
              </motion.div>
            ) : null}

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

            {/* Upload review: name + submit */}
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
                  {selectedRegion ? (
                    <p className="text-[12px] text-[var(--color-bone-dim)]">
                      Clip: {fmt(selectedRegion.start)} – {fmt(selectedRegion.end)}
                    </p>
                  ) : null}
                  <Button variant="primary" size="md" onClick={submitUpload}>
                    {selectedRegion ? "Clone this clip" : "Make the clone"}
                  </Button>
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

function fmt(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}
