// Formats ElevenLabs accepts natively — everything else needs server-side conversion.
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
  // Fall back to extension — bare ".mp4" could be video, always convert it.
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return !NATIVE_EXTS.has(ext);
}

// Sends the file to /api/convert (server-side ffmpeg) and returns an MP3 File.
// onProgress receives fake incremental values so the UI stays alive during the wait.
export async function convertToMp3(
  file: File,
  onProgress?: (pct: number) => void,
): Promise<File> {
  let pct = 5;
  onProgress?.(pct);

  const interval = setInterval(() => {
    pct = Math.min(85, pct + 3);
    onProgress?.(pct);
  }, 2000);

  try {
    const fd = new FormData();
    fd.append("audio", file);

    const res = await fetch("/api/convert", { method: "POST", body: fd });

    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      throw new Error((json as { error?: string }).error ?? "Conversion failed");
    }

    onProgress?.(99);
    const blob = await res.blob();
    const baseName = file.name.replace(/\.[^.]+$/, "");
    return new File([blob], `${baseName}.mp3`, { type: "audio/mpeg" });
  } finally {
    clearInterval(interval);
  }
}
