export type QualityVerdict =
  | "warming"
  | "ready"
  | "too-quiet"
  | "too-loud"
  | "noisy";

export interface QualityState {
  rmsAvg: number;
  peakMax: number;
  rmsBaseline: number;
  framesSinceStart: number;
}

export function makeQualityState(): QualityState {
  return { rmsAvg: 0, peakMax: 0, rmsBaseline: 0, framesSinceStart: 0 };
}

export function updateQuality(
  state: QualityState,
  rms: number,
  peak: number,
): QualityState {
  const next: QualityState = {
    rmsAvg: state.rmsAvg * 0.92 + rms * 0.08,
    peakMax: Math.max(state.peakMax * 0.992, peak),
    rmsBaseline:
      state.framesSinceStart < 60
        ? state.rmsBaseline * 0.6 + rms * 0.4
        : state.rmsBaseline,
    framesSinceStart: state.framesSinceStart + 1,
  };
  return next;
}

export function classifyQuality(state: QualityState): QualityVerdict {
  if (state.framesSinceStart < 30) return "warming";
  if (state.peakMax > 0.985) return "too-loud";
  if (state.rmsAvg < 0.012) return "too-quiet";
  // A baseline that's high relative to active level suggests noisy room
  if (state.rmsBaseline > 0.05 && state.rmsAvg < state.rmsBaseline * 1.6) {
    return "noisy";
  }
  return "ready";
}

export function qualityCopy(verdict: QualityVerdict): {
  title: string;
  hint: string;
  tone: "warming" | "ok" | "warn";
} {
  switch (verdict) {
    case "warming":
      return {
        title: "Listening",
        hint: "Take a breath. Read when you’re ready.",
        tone: "warming",
      };
    case "ready":
      return {
        title: "Sounds clean",
        hint: "Keep this distance. Read at a natural pace.",
        tone: "ok",
      };
    case "too-quiet":
      return {
        title: "A little quiet",
        hint: "Move slightly closer to the microphone.",
        tone: "warn",
      };
    case "too-loud":
      return {
        title: "Touch close",
        hint: "Pull back two inches and lower your voice a notch.",
        tone: "warn",
      };
    case "noisy":
      return {
        title: "Some background",
        hint: "If you can, find somewhere quieter. It will sound better.",
        tone: "warn",
      };
  }
}
