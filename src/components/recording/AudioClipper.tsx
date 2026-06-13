"use client";

import { useRef, useMemo, useState, useCallback } from "react";
import WavesurferPlayer from "@wavesurfer/react";
import RegionsPlugin from "wavesurfer.js/plugins/regions";
import type WaveSurfer from "wavesurfer.js";

// Ember tint for the selected clip region — works on both themes.
const regionColor = "rgba(194,120,74,0.22)";

interface Props {
  url: string;
  showNudge: boolean;
  onDurationReady: (seconds: number) => void;
  onRegionChange: (region: { start: number; end: number } | null) => void;
}

export function AudioClipper({ url, showNudge, onDurationReady, onRegionChange }: Props) {
  const wsRef = useRef<WaveSurfer | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [totalDuration, setTotalDuration] = useState(0);
  const [hasRegion, setHasRegion] = useState(false);
  const [isSuggesting, setIsSuggesting] = useState(false);

  const [regionsPlugin] = useState(() => RegionsPlugin.create());
  const plugins = useMemo(() => [regionsPlugin], [regionsPlugin]);

  // Waveform colors must contrast with whichever theme is active. The base
  // tokens are light (bone), which disappear on the default light theme — so
  // pick dark bars on light, light bars on dark.
  const isDark =
    typeof document !== "undefined" &&
    document.documentElement.dataset.theme === "dark";
  const waveColor = isDark ? "rgba(245,239,230,0.28)" : "rgba(36,27,17,0.32)";
  const progressColor = isDark ? "rgba(245,239,230,0.6)" : "rgba(36,27,17,0.62)";

  const handleReady = useCallback(
    (ws: WaveSurfer, duration: number) => {
      wsRef.current = ws;
      setTotalDuration(duration);
      setIsLoading(false);
      onDurationReady(duration);

      const rp = regionsPlugin;

      rp.enableDragSelection({ color: regionColor });

      rp.on("region-created", (region) => {
        rp.getRegions().forEach((r) => {
          if (r !== region) r.remove();
        });
        setHasRegion(true);
        onRegionChange({ start: region.start, end: region.end });
      });

      rp.on("region-updated", (region) => {
        onRegionChange({ start: region.start, end: region.end });
      });
    },
    [onDurationReady, onRegionChange, regionsPlugin],
  );

  const clearRegion = useCallback(() => {
    regionsPlugin.getRegions().forEach((r) => r.remove());
    setHasRegion(false);
    onRegionChange(null);
  }, [onRegionChange, regionsPlugin]);

  const selectRange = useCallback(
    (start: number, end: number) => {
      const boundedStart = Math.max(0, Math.min(start, totalDuration));
      const boundedEnd = Math.max(
        boundedStart + 1,
        Math.min(end, totalDuration || boundedStart + 60),
      );
      regionsPlugin.getRegions().forEach((r) => r.remove());
      regionsPlugin.addRegion({
        start: boundedStart,
        end: boundedEnd,
        color: regionColor,
      });
      setHasRegion(true);
      onRegionChange({ start: boundedStart, end: boundedEnd });
      wsRef.current?.setTime(boundedStart);
    },
    [onRegionChange, regionsPlugin, totalDuration],
  );

  const suggestBestClip = useCallback(async () => {
    if (!totalDuration) return;
    setIsSuggesting(true);
    try {
      const range = await findBestClipRange(url, totalDuration);
      selectRange(range.start, range.end);
    } catch {
      const end = Math.min(60, totalDuration);
      const start = Math.max(0, (totalDuration - end) / 2);
      selectRange(start, start + end);
    } finally {
      setIsSuggesting(false);
    }
  }, [selectRange, totalDuration, url]);

  return (
    <div className="space-y-2">
      <div className="hairline overflow-hidden rounded-xl bg-white/[0.015] px-4 pt-4 pb-3">
        {/* Loading state — shown until WaveSurfer finishes decoding */}
        {isLoading ? (
          <div className="flex h-[72px] items-center justify-center gap-3">
            <span className="relative inline-flex h-2 w-2">
              <span className="absolute inset-[-5px] animate-ping rounded-full bg-[var(--color-ember)]/30" />
              <span className="relative h-2 w-2 rounded-full bg-[var(--color-ember)]" />
            </span>
            <span className="text-[13px] text-[var(--color-bone-dim)]">
              Analyzing audio…
            </span>
          </div>
        ) : null}

        {/* WaveSurfer — hidden while loading so canvas renders at full size */}
        <div style={{ display: isLoading ? "none" : "block" }}>
          <WavesurferPlayer
            url={url}
            plugins={plugins}
            height={72}
            waveColor={waveColor}
            progressColor={progressColor}
            cursorColor="rgba(194,120,74,0.9)"
            barWidth={2}
            barGap={1}
            barRadius={2}
            normalize
            onReady={handleReady}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onTimeupdate={(ws, t) => setCurrentTime(t)}
          />
        </div>

        {!isLoading ? (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => wsRef.current?.playPause()}
              className="text-[12px] text-[var(--color-bone-dim)] transition-colors hover:text-[var(--color-bone)]"
            >
              {isPlaying ? "Pause" : "Play"}
            </button>
            <span className="text-[12px] text-[var(--color-bone-dim)]/80">
              {fmt(currentTime)} / {fmt(totalDuration)}
            </span>
            <button
              type="button"
              onClick={() => void suggestBestClip()}
              disabled={isSuggesting}
              className="text-[11px] text-[var(--color-bone-dim)]/80 transition-colors hover:text-[var(--color-bone-dim)] disabled:opacity-50 sm:ml-auto"
            >
              {isSuggesting ? "Finding clip..." : "Suggest best clip"}
            </button>
            {hasRegion ? (
              <button
                type="button"
                onClick={clearRegion}
                className="text-[11px] text-[var(--color-bone-dim)]/80 transition-colors hover:text-[var(--color-bone-dim)]"
              >
                Clear selection
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      {!isLoading && totalDuration > 20 ? (
        <div className="flex flex-wrap gap-2">
          {[
            ["First 60s", 0],
            ["Middle 60s", Math.max(0, totalDuration / 2 - 30)],
            ["Last 60s", Math.max(0, totalDuration - 60)],
          ].map(([label, start]) => (
            <button
              key={label}
              type="button"
              onClick={() => selectRange(Number(start), Number(start) + Math.min(60, totalDuration))}
              className="rounded-full border border-[var(--color-rule-strong)] px-3 py-1.5 text-[11px] text-[var(--color-bone-dim)] transition hover:text-[var(--color-bone)]"
            >
              {label}
            </button>
          ))}
        </div>
      ) : null}

      {showNudge && !hasRegion && !isLoading ? (
        <p className="text-[12px] leading-[1.6] text-[var(--color-bone-dim)]">
          Long recording — drag on the waveform to pick the clearest 30–60 seconds,
          or just clone the whole thing.
        </p>
      ) : null}

      {hasRegion ? (
        <p className="text-[12px] text-[var(--color-bone-dim)]">
          Selected clip will be used for cloning.
        </p>
      ) : null}
    </div>
  );
}

function fmt(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

async function findBestClipRange(
  url: string,
  duration: number,
): Promise<{ start: number; end: number }> {
  const response = await fetch(url);
  const arrayBuffer = await response.arrayBuffer();
  const AudioContextCtor =
    window.AudioContext ||
    (window as typeof window & { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AudioContextCtor) throw new Error("AudioContext unavailable");
  const audioContext = new AudioContextCtor();
  try {
    const decoded = await audioContext.decodeAudioData(arrayBuffer.slice(0));
    const channel = decoded.getChannelData(0);
    const sampleRate = decoded.sampleRate;
    const windowSeconds = Math.min(60, Math.max(20, duration));
    const stepSeconds = duration > 120 ? 5 : 2;
    let best = { start: 0, end: windowSeconds, score: -Infinity };

    for (let start = 0; start <= Math.max(0, duration - windowSeconds); start += stepSeconds) {
      const score = scoreWindow(channel, sampleRate, start, start + windowSeconds);
      if (score > best.score) best = { start, end: start + windowSeconds, score };
    }

    return { start: best.start, end: Math.min(duration, best.end) };
  } finally {
    void audioContext.close();
  }
}

function scoreWindow(
  samples: Float32Array,
  sampleRate: number,
  startSeconds: number,
  endSeconds: number,
): number {
  const start = Math.floor(startSeconds * sampleRate);
  const end = Math.min(samples.length, Math.floor(endSeconds * sampleRate));
  let sumSquares = 0;
  let clipped = 0;
  let silent = 0;
  const stride = Math.max(1, Math.floor(sampleRate / 400));

  for (let i = start; i < end; i += stride) {
    const value = Math.abs(samples[i] ?? 0);
    sumSquares += value * value;
    if (value > 0.97) clipped += 1;
    if (value < 0.01) silent += 1;
  }

  const frames = Math.max(1, Math.ceil((end - start) / stride));
  const rms = Math.sqrt(sumSquares / frames);
  return rms - clipped / frames - (silent / frames) * 0.15;
}
