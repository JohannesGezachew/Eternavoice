// Formats the hosted voice engine accepts natively — everything else needs conversion.
const NATIVE_TYPES = new Set([
  "audio/mpeg", "audio/mp3", "audio/mp4", "audio/x-m4a",
  "audio/wav", "audio/x-wav", "audio/webm", "audio/ogg", "audio/aac",
]);
const NATIVE_EXTS = new Set(["mp3", "m4a", "wav", "webm", "ogg", "aac"]);

export function needsConversion(file: File): boolean {
  if (file.type.startsWith("video/")) return true;
  if (file.type && NATIVE_TYPES.has(file.type)) return false;
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return !NATIVE_EXTS.has(ext);
}

// ─── Primary: client-side decode via Web Audio API ───────────────────────────
// Works for MP4, MOV, M4A, WebM — the browser decodes the audio track natively.
// Output is a WAV at 22 kHz mono (~26 MB for 10 min vs >100 MB at full quality).
// No server upload involved so Vercel payload limits are irrelevant.
async function convertClientSide(
  file: File,
  onProgress?: (pct: number) => void,
): Promise<File> {
  onProgress?.(10);

  // Read the file into memory
  const arrayBuffer = await file.arrayBuffer();
  onProgress?.(25);

  // Decode using the browser's native audio/video codecs (MP4/AAC, WebM/Opus, etc.)
  const ctx = new AudioContext();
  let decoded: AudioBuffer;
  try {
    decoded = await ctx.decodeAudioData(arrayBuffer);
  } catch (e) {
    await ctx.close().catch(() => null);
    throw new Error(`Browser could not decode this file: ${e instanceof Error ? e.message : String(e)}`);
  }
  await ctx.close().catch(() => null);
  onProgress?.(55);

  // Resample to 22 kHz mono via OfflineAudioContext.
  // Stereo → mono downmix is automatic when numberOfChannels=1.
  const targetSr = 22050;
  const targetLen = Math.ceil(decoded.duration * targetSr);
  const offline = new OfflineAudioContext(1, targetLen, targetSr);
  const src = offline.createBufferSource();
  src.buffer = decoded;
  src.connect(offline.destination);
  src.start(0);
  const resampled = await offline.startRendering();
  onProgress?.(85);

  const wav = encodeWav(resampled);
  onProgress?.(99);

  const baseName = file.name.replace(/\.[^.]+$/, "");
  return new File([wav], `${baseName}.wav`, { type: "audio/wav" });
}

// ─── Fallback: server-side via /api/convert (ffmpeg) ─────────────────────────
// Used when the browser cannot decode the format (rare exotic containers).
// Only works for files under ~4 MB on Vercel (serverless payload limit).
async function convertServerSide(
  file: File,
  onProgress?: (pct: number) => void,
): Promise<File> {
  let pct = 5;
  onProgress?.(pct);
  const ticker = setInterval(() => {
    pct = Math.min(85, pct + 4);
    onProgress?.(pct);
  }, 1500);

  try {
    const res = await fetch("/api/convert", {
      method: "POST",
      headers: { "x-filename": encodeURIComponent(file.name) },
      body: file,
    });

    if (!res.ok) {
      let message = `Server error ${res.status}`;
      try {
        const ct = res.headers.get("content-type") ?? "";
        if (ct.includes("application/json")) {
          const json = (await res.json()) as { error?: string };
          if (json.error) message = json.error;
        } else {
          const text = await res.text();
          message = text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 300);
        }
      } catch { /* ignore */ }
      throw new Error(message);
    }

    onProgress?.(99);
    const blob = await res.blob();
    if (!blob.size) throw new Error("Server returned empty file");

    const baseName = file.name.replace(/\.[^.]+$/, "");
    return new File([blob], `${baseName}.mp3`, { type: "audio/mpeg" });
  } finally {
    clearInterval(ticker);
  }
}

// ─── Public entry point ───────────────────────────────────────────────────────
export async function convertToMp3(
  file: File,
  onProgress?: (pct: number) => void,
): Promise<File> {
  // Try the client-side path first — no upload, no size limits.
  try {
    return await convertClientSide(file, onProgress);
  } catch (clientErr) {
    console.warn("[convert] client-side failed, trying server:", clientErr);
    // Fall back to server for formats the browser cannot decode.
    return await convertServerSide(file, onProgress);
  }
}

// ─── WAV encoder ─────────────────────────────────────────────────────────────
function encodeWav(buffer: AudioBuffer): Blob {
  const ch = buffer.numberOfChannels;
  const sr = buffer.sampleRate;
  const len = buffer.length;
  const dataSize = len * ch * 2;
  const ab = new ArrayBuffer(44 + dataSize);
  const v = new DataView(ab);
  const s = (off: number, str: string) => {
    for (let i = 0; i < str.length; i++) v.setUint8(off + i, str.charCodeAt(i));
  };
  s(0, "RIFF"); v.setUint32(4, 36 + dataSize, true);
  s(8, "WAVE"); s(12, "fmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true);
  v.setUint16(22, ch, true); v.setUint32(24, sr, true);
  v.setUint32(28, sr * ch * 2, true); v.setUint16(32, ch * 2, true);
  v.setUint16(34, 16, true); s(36, "data");
  v.setUint32(40, dataSize, true);
  let off = 44;
  for (let i = 0; i < len; i++) {
    for (let c = 0; c < ch; c++) {
      const x = Math.max(-1, Math.min(1, buffer.getChannelData(c)[i] ?? 0));
      v.setInt16(off, x < 0 ? x * 0x8000 : x * 0x7fff, true);
      off += 2;
    }
  }
  return new Blob([ab], { type: "audio/wav" });
}
