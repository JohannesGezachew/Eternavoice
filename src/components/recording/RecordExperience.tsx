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
import { formatSeconds } from "@/lib/utils";

type Phase = "intro" | "recording" | "review" | "uploading" | "ready";

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

  const [phase, setPhase] = useState<Phase>("intro");
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [verdict, setVerdict] = useState<QualityVerdict>("warming");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [take, setTake] = useState<Take | null>(null);
  const [data, setData] = useState<Uint8Array | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const recorderRef = useRef<ActiveRecorder | null>(null);
  const qualityRef = useRef<QualityState>(makeQualityState());

  useEffect(() => {
    return () => {
      recorderRef.current?.cancel();
      if (take) URL.revokeObjectURL(take.url);
    };
  }, [take]);

  const start = useCallback(async () => {
    setPermissionError(null);
    qualityRef.current = makeQualityState();
    setVerdict("warming");
    setElapsedMs(0);
    try {
      const recorder = await startRecording({
        // IVC cloning prefers a flat unprocessed signal.
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
      // Brief pause for the success transition before routing
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
          Read this slowly.
          <br />
          <span className="italic text-[var(--color-bone)]/80">
            The way you would tell it.
          </span>
        </motion.h1>
        <motion.p
          variants={fadeUp}
          className="max-w-xl text-[15px] leading-[1.7] text-[var(--color-bone)]/65"
        >
          Around seventy-five seconds is enough. Don’t perform — just read. The
          recording stays on this device until you choose to make the clone.
        </motion.p>
      </motion.header>

      <div className="mt-10 grid flex-1 gap-10 lg:grid-cols-[1.15fr_0.85fr] lg:gap-14">
        <section className="relative">
          <div className="hairline rounded-2xl bg-white/[0.015] p-7 sm:p-9">
            <Script active={phase === "recording"} />
          </div>
        </section>

        <aside className="flex flex-col gap-6">
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

          <AnimatePresence mode="wait">
            {phase === "intro" ? (
              <motion.div
                key="intro"
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
                    <RecordControl
                      state="idle"
                      onClick={start}
                      label="Tap to begin"
                    />
                    <p className="max-w-[200px] text-right text-[12px] leading-[1.6] text-[var(--color-bone-dim)]">
                      We’ll ask the browser for the microphone, then you can read.
                    </p>
                  </div>
                  {permissionError ? (
                    <p className="text-[13px] text-[var(--color-ember-soft)]">
                      {permissionError}
                    </p>
                  ) : null}
                  {existingVoice ? (
                    <p className="text-[12px] text-[var(--color-bone-dim)]">
                      A voice from this session already exists. Recording again
                      will replace it.
                    </p>
                  ) : null}
                </div>
              </motion.div>
            ) : null}

            {phase === "recording" ? (
              <motion.div
                key="rec"
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

            {phase === "review" && take ? (
              <motion.div
                key="review"
                variants={fadeUp}
                initial="initial"
                animate="enter"
                exit="exit"
                className="hairline rounded-2xl bg-white/[0.015] p-7 sm:p-9"
              >
                <div className="space-y-5">
                  <p className="text-[14px] text-[var(--color-bone)]/85">
                    Listen back before we lift the clone.
                    {undershoot
                      ? " A touch short — another twenty seconds will help realism."
                      : ""}
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
