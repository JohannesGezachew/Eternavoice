import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util";

// Formats ElevenLabs accepts natively — everything else gets converted.
const NATIVE_TYPES = new Set([
  "audio/mpeg",
  "audio/mp3",
  "audio/mp4",
  "audio/x-m4a",
  "audio/wav",
  "audio/x-wav",
  "audio/webm",
  "audio/ogg",
  "audio/aac",
]);

const NATIVE_EXTS = new Set(["mp3", "m4a", "wav", "webm", "ogg", "aac"]);

export function needsConversion(file: File): boolean {
  // Any video MIME type needs audio extraction regardless of extension.
  if (file.type.startsWith("video/")) return true;
  // Known native audio types pass through.
  if (file.type && NATIVE_TYPES.has(file.type)) return false;
  // Fall back to extension — note: bare ".mp4" could be video, so convert it.
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return !NATIVE_EXTS.has(ext);
}

// Singleton — keeps the 31 MB WASM in memory so repeat conversions are instant.
let _ffmpeg: FFmpeg | null = null;
let _loadPromise: Promise<FFmpeg> | null = null;

async function getFFmpeg(): Promise<FFmpeg> {
  if (_ffmpeg?.loaded) return _ffmpeg;
  if (_loadPromise) return _loadPromise;

  _loadPromise = (async () => {
    const ffmpeg = new FFmpeg();
    // Served from /public/ffmpeg — same origin, no CDN dependency, no CSP issues.
    // Direct paths work here because the files are same-origin; toBlobURL is not needed.
    try {
      await ffmpeg.load({
        coreURL: "/ffmpeg/ffmpeg-core.js",
        wasmURL: "/ffmpeg/ffmpeg-core.wasm",
      });
    } catch (e) {
      _loadPromise = null; // Allow retry on next call instead of caching the failure.
      throw e;
    }
    _ffmpeg = ffmpeg;
    _loadPromise = null;
    return ffmpeg;
  })();

  return _loadPromise;
}

export async function convertToMp3(
  file: File,
  onProgress?: (pct: number) => void,
): Promise<File> {
  const ffmpeg = await getFFmpeg();

  const ext = file.name.split(".").pop() ?? "bin";
  const inputName = `in.${ext}`;

  await ffmpeg.writeFile(inputName, await fetchFile(file));

  const handler = ({ progress }: { progress: number }) => {
    onProgress?.(Math.min(99, Math.round(progress * 100)));
  };
  if (onProgress) ffmpeg.on("progress", handler);

  try {
    await ffmpeg.exec([
      "-i", inputName,
      "-vn",                   // strip video track
      "-acodec", "libmp3lame",
      "-b:a", "128k",          // 128 kbps CBR — plenty for voice, encodes faster than VBR
      "-ar", "22050",          // 22 kHz — voice range, halves the data vs 44.1 kHz
      "out.mp3",
    ]);
  } finally {
    if (onProgress) ffmpeg.off("progress", handler);
    await ffmpeg.deleteFile(inputName).catch(() => null);
  }

  const data = await ffmpeg.readFile("out.mp3");
  await ffmpeg.deleteFile("out.mp3").catch(() => null);

  const baseName = file.name.replace(/\.[^.]+$/, "");
  // Copy into a plain ArrayBuffer to satisfy strict TS Blob constraints.
  const bytes = new Uint8Array(
    data instanceof Uint8Array ? data : new TextEncoder().encode(String(data)),
  );
  const blob = new Blob([bytes.buffer as ArrayBuffer], { type: "audio/mpeg" });
  return new File([blob], `${baseName}.mp3`, { type: "audio/mpeg" });
}
