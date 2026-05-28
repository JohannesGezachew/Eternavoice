"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/Button";
import { useSession } from "@/lib/session";
import { Mark } from "@/components/shell/Mark";
import { fadeUp, stagger } from "@/lib/motion";
import { trackEvent } from "@/lib/analytics";

export function VoicePreview() {
  const router = useRouter();
  const voiceId = useSession((s) => s.voiceId);
  const voiceName = useSession((s) => s.voiceName);
  const persona = useSession((s) => s.persona);
  const setPersona = useSession((s) => s.setPersona);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verdict, setVerdict] = useState<"good" | "bad" | null>(null);
  const [calibration, setCalibration] = useState(persona.calibration ?? {});
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!voiceId) router.replace("/record");
  }, [voiceId, router]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const loadPreview = useCallback(async () => {
    if (!voiceId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/voice-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voiceId, name: voiceName }),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(json?.error || "Could not generate a preview.");
      }
      const blob = await res.blob();
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      const url = URL.createObjectURL(blob);
      setPreviewUrl(url);
      trackEvent("voice_preview_generated");
      window.setTimeout(() => void audioRef.current?.play().catch(() => null), 50);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not generate a preview.");
      trackEvent("voice_preview_failed");
    } finally {
      setLoading(false);
    }
  }, [voiceId, voiceName, previewUrl]);

  if (!voiceId) return null;

  const toggleCalibration = (key: keyof NonNullable<typeof persona.calibration>) => {
    const next = { ...calibration, [key]: !calibration[key] };
    setCalibration(next);
    setPersona({ ...persona, calibration: next });
    trackEvent("voice_style_calibrated", { key, enabled: Boolean(next[key]) });
  };

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col px-6 py-6 sm:px-8">
      <header className="flex items-center justify-between">
        <Link href="/" aria-label="Home" className="-mx-1 px-1">
          <Mark />
        </Link>
        <Link
          href="/record"
          className="text-[12px] text-[var(--color-bone-dim)] transition hover:text-[var(--color-bone)]"
        >
          Make another clone
        </Link>
      </header>

      <main className="flex flex-1 items-center justify-center py-14">
        <motion.section
          initial={false}
          animate="enter"
          variants={stagger(0.07)}
          className="w-full max-w-xl"
        >
          <motion.div variants={fadeUp} className="space-y-3">
            <p className="text-[12px] tracking-[0.22em] text-[var(--color-bone-dim)] uppercase">
              Step two · Preview
            </p>
            <h1 className="font-serif text-[38px] leading-[1.08] text-[var(--color-bone)] sm:text-[54px]">
              How does it sound?
            </h1>
            <p className="max-w-lg text-[15px] leading-[1.7] text-[var(--color-bone)]/65">
              Listen once before setting up the persona. If the voice feels thin,
              noisy, or unlike the person, make another clone with cleaner speech.
            </p>
          </motion.div>

          <motion.div variants={fadeUp} className="mt-8 hairline rounded-2xl bg-white/[0.02] p-6 sm:p-7">
            <div className="flex flex-col gap-5">
              <div>
                <p className="font-serif text-[22px] text-[var(--color-bone)]">
                  {voiceName || "Saved voice"}
                </p>
                <p className="mt-1 text-[12px] text-[var(--color-bone-dim)]">
                  This preview uses the cloned voice, not the original recording.
                </p>
              </div>

              {previewUrl ? (
                <div className="space-y-4">
                  <audio
                    ref={audioRef}
                    src={previewUrl}
                    controls
                    className="w-full"
                    preload="auto"
                  />
                  <div className="grid gap-2 sm:grid-cols-2">
                    {(["good", "bad"] as const).map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => {
                          setVerdict(v);
                          trackEvent("voice_preview_rated", { verdict: v });
                        }}
                        className={[
                          "rounded-xl border px-4 py-3 text-left text-[13px] transition-all duration-200",
                          verdict === v
                            ? "border-[var(--color-ember)]/50 bg-[var(--color-ember)]/[0.07] text-[var(--color-bone)]"
                            : "border-[var(--color-rule-strong)] text-[var(--color-bone)]/75 hover:border-[var(--color-ember)]/30 hover:text-[var(--color-bone)]",
                        ].join(" ")}
                      >
                        {v === "good" ? "Sounds right" : "Needs improvement"}
                      </button>
                    ))}
                  </div>

                  {verdict === "bad" ? (
                    <motion.div
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                      className="space-y-3"
                    >
                      <p className="text-[13px] leading-[1.65] text-[var(--color-bone-dim)]">
                        Try a cleaner 30–60 second clip with one speaker, less
                        background noise, and a steady distance from the mic. Or
                        adjust the style below before continuing.
                      </p>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {[
                          ["tooFormal", "Less formal"],
                          ["tooCheerful", "Less cheerful"],
                          ["tooManyQuestions", "Fewer questions"],
                          ["tooLong", "Much shorter"],
                          ["notWarmEnough", "Warmer"],
                        ].map(([key, label]) => (
                          <button
                            key={key}
                            type="button"
                            onClick={() =>
                              toggleCalibration(
                                key as keyof NonNullable<typeof persona.calibration>,
                              )
                            }
                            className={[
                              "rounded-xl border px-3 py-2 text-left text-[12px] transition-all duration-200",
                              calibration[key as keyof typeof calibration]
                                ? "border-[var(--color-ember)]/50 bg-[var(--color-ember)]/[0.07] text-[var(--color-bone)]"
                                : "border-[var(--color-rule-strong)] text-[var(--color-bone-dim)] hover:border-[var(--color-ember)]/30 hover:text-[var(--color-bone)]",
                            ].join(" ")}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </motion.div>
                  ) : null}
                </div>
              ) : null}

              {error ? (
                <p className="text-[13px] leading-[1.6] text-[var(--color-ember-soft)]">
                  {error}
                </p>
              ) : null}

              <div className="flex flex-wrap gap-3">
                <Button variant="primary" size="md" onClick={loadPreview} loading={loading} disabled={loading}>
                  {loading ? "Generating…" : previewUrl ? "Replay preview" : "Play preview"}
                </Button>
                <Button variant="outline" size="md" onClick={() => router.push("/record")}>
                  Re-clone
                </Button>
                <Button
                  variant="ghost"
                  size="md"
                  disabled={!previewUrl}
                  onClick={() => router.push("/persona")}
                >
                  Continue →
                </Button>
              </div>
            </div>
          </motion.div>
        </motion.section>
      </main>
    </div>
  );
}
