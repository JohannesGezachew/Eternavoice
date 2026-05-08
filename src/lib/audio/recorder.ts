"use client";

export interface RecorderInit {
  onLevel?: (rms: number, peak: number) => void;
  onTimeData?: (data: Uint8Array) => void;
  onTick?: (elapsedMs: number) => void;
  /**
   * When true (default), browser-level automatic gain control is enabled.
   * Keep it true for live conversation/transcription so quieter voices still
   * cross the VAD threshold. Pass `false` for IVC voice cloning where a flat
   * unprocessed signal produces a better clone.
   */
  autoGainControl?: boolean;
}

export interface ActiveRecorder {
  stop: () => Promise<{ blob: Blob; mimeType: string; durationMs: number }>;
  cancel: () => void;
  stream: MediaStream;
  audioContext: AudioContext;
  analyser: AnalyserNode;
}

const PREFERRED_MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/mpeg",
];

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  for (const t of PREFERRED_MIME_TYPES) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return undefined;
}

export async function startRecording(init: RecorderInit = {}): Promise<ActiveRecorder> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices) {
    throw new Error("Microphone is not available in this browser.");
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: init.autoGainControl ?? true,
      channelCount: 1,
      sampleRate: 48000,
    },
    video: false,
  });

  const AudioContextCtor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextCtor) {
    stream.getTracks().forEach((t) => t.stop());
    throw new Error("Web Audio is not supported in this browser.");
  }
  const audioContext = new AudioContextCtor({ sampleRate: 48000 });
  const source = audioContext.createMediaStreamSource(stream);
  const analyser = audioContext.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.7;
  source.connect(analyser);

  const mimeType = pickMimeType();
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType, audioBitsPerSecond: 128_000 } : undefined);

  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  const startedAt = performance.now();
  let stopped = false;
  let frameId = 0;

  const timeBuffer = new Uint8Array(analyser.fftSize);

  const tick = () => {
    if (stopped) return;
    analyser.getByteTimeDomainData(timeBuffer);
    let sumSq = 0;
    let peak = 0;
    for (let i = 0; i < timeBuffer.length; i++) {
      const v = ((timeBuffer[i] ?? 128) - 128) / 128;
      sumSq += v * v;
      const abs = Math.abs(v);
      if (abs > peak) peak = abs;
    }
    const rms = Math.sqrt(sumSq / timeBuffer.length);
    init.onLevel?.(rms, peak);
    init.onTimeData?.(timeBuffer);
    init.onTick?.(performance.now() - startedAt);
    frameId = requestAnimationFrame(tick);
  };
  frameId = requestAnimationFrame(tick);

  recorder.start(250);

  const teardown = () => {
    stopped = true;
    cancelAnimationFrame(frameId);
    stream.getTracks().forEach((t) => t.stop());
    void audioContext.close();
  };

  return {
    stream,
    audioContext,
    analyser,
    stop: () =>
      new Promise((resolve, reject) => {
        if (recorder.state === "inactive") {
          teardown();
          resolve({
            blob: new Blob(chunks, { type: mimeType ?? "audio/webm" }),
            mimeType: mimeType ?? "audio/webm",
            durationMs: performance.now() - startedAt,
          });
          return;
        }
        recorder.onstop = () => {
          teardown();
          const blob = new Blob(chunks, { type: mimeType ?? "audio/webm" });
          resolve({
            blob,
            mimeType: mimeType ?? "audio/webm",
            durationMs: performance.now() - startedAt,
          });
        };
        recorder.onerror = (e) => {
          teardown();
          reject(e);
        };
        try {
          recorder.stop();
        } catch (e) {
          teardown();
          reject(e);
        }
      }),
    cancel: () => {
      try {
        if (recorder.state !== "inactive") recorder.stop();
      } catch {
        // ignored
      }
      teardown();
    },
  };
}
