"use client";

import { useRef, useMemo, useState, useCallback } from "react";
import WavesurferPlayer from "@wavesurfer/react";
import RegionsPlugin from "wavesurfer.js/plugins/regions";
import type WaveSurfer from "wavesurfer.js";

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

  const [regionsPlugin] = useState(() => RegionsPlugin.create());
  const plugins = useMemo(() => [regionsPlugin], [regionsPlugin]);

  const handleReady = useCallback(
    (ws: WaveSurfer, duration: number) => {
      wsRef.current = ws;
      setTotalDuration(duration);
      setIsLoading(false);
      onDurationReady(duration);

      const rp = regionsPlugin;

      rp.enableDragSelection({ color: "rgba(199,162,124,0.15)" });

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
            waveColor="rgba(245,239,230,0.18)"
            progressColor="rgba(245,239,230,0.5)"
            cursorColor="rgba(199,162,124,0.8)"
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
          <div className="mt-3 flex items-center gap-3">
            <button
              type="button"
              onClick={() => wsRef.current?.playPause()}
              className="text-[12px] text-[var(--color-bone-dim)] transition-colors hover:text-[var(--color-bone)]"
            >
              {isPlaying ? "Pause" : "Play"}
            </button>
            <span className="text-[12px] text-[var(--color-bone-dim)]/40">
              {fmt(currentTime)} / {fmt(totalDuration)}
            </span>
            {hasRegion ? (
              <button
                type="button"
                onClick={clearRegion}
                className="ml-auto text-[11px] text-[var(--color-bone-dim)]/50 transition-colors hover:text-[var(--color-bone-dim)]"
              >
                Clear selection
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

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
