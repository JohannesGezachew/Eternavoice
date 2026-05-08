"use client";

import { useEffect, useRef } from "react";

interface WaveformProps {
  active: boolean;
  data: Uint8Array | null;
  className?: string;
}

export function Waveform({ active, data, className }: WaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    let raf = 0;
    let phase = 0;

    const draw = () => {
      raf = requestAnimationFrame(draw);
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      const mid = h / 2;
      const samples = 96;
      const stride = data ? Math.floor(data.length / samples) : 0;

      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      for (let layer = 0; layer < 3; layer++) {
        const layerAlpha = layer === 0 ? 1 : 0.55 - layer * 0.18;
        const layerOffset = layer * 0.5;
        const lineWidth = (layer === 0 ? 2.2 : 1.4) * dpr;

        ctx.beginPath();
        for (let i = 0; i < samples; i++) {
          const x = (i / (samples - 1)) * w;
          let amp: number;
          if (data && stride) {
            const v = ((data[i * stride] ?? 128) - 128) / 128;
            amp = v;
          } else {
            amp = 0;
          }
          const breath = Math.sin(phase * 0.04 + i * 0.18 + layerOffset) * (active ? 0.04 : 0.012);
          const y = mid + (amp + breath) * (h * 0.42);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }

        const grad = ctx.createLinearGradient(0, 0, w, 0);
        grad.addColorStop(0, `rgba(199, 162, 124, ${0.0})`);
        grad.addColorStop(0.15, `rgba(199, 162, 124, ${0.5 * layerAlpha})`);
        grad.addColorStop(0.5, `rgba(245, 239, 230, ${0.85 * layerAlpha})`);
        grad.addColorStop(0.85, `rgba(199, 162, 124, ${0.5 * layerAlpha})`);
        grad.addColorStop(1, `rgba(199, 162, 124, ${0.0})`);
        ctx.strokeStyle = grad;
        ctx.lineWidth = lineWidth;
        ctx.stroke();
      }

      // Center hairline
      ctx.beginPath();
      ctx.moveTo(0, mid);
      ctx.lineTo(w, mid);
      ctx.strokeStyle = "rgba(245, 239, 230, 0.06)";
      ctx.lineWidth = 1;
      ctx.stroke();

      phase += 1;
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [active, data]);

  return <canvas ref={canvasRef} className={className} aria-hidden />;
}
