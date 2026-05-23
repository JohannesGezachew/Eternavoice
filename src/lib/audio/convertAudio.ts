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
  if (file.type.startsWith("video/")) return true;
  if (file.type && NATIVE_TYPES.has(file.type)) return false;
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return !NATIVE_EXTS.has(ext);
}

// Sends the file to /api/convert (server-side ffmpeg) and returns an MP3 File.
export async function convertToMp3(
  file: File,
  onProgress?: (pct: number) => void,
): Promise<File> {
  // Fake incremental progress so the UI stays alive while we wait.
  let pct = 5;
  onProgress?.(pct);
  const ticker = setInterval(() => {
    pct = Math.min(85, pct + 3);
    onProgress?.(pct);
  }, 2000);

  try {
    // Send the file as a raw binary body — avoids all multipart/formData parsing issues.
    const res = await fetch("/api/convert", {
      method: "POST",
      headers: { "x-filename": encodeURIComponent(file.name) },
      body: file,
    });

    if (!res.ok) {
      // Try to get a meaningful error message regardless of Content-Type.
      let message = `Server error ${res.status}`;
      try {
        const ct = res.headers.get("content-type") ?? "";
        if (ct.includes("application/json")) {
          const json = (await res.json()) as { error?: string };
          if (json.error) message = json.error;
        } else {
          // HTML error page from Next.js — extract text if short enough
          const text = await res.text();
          const brief = text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 200);
          if (brief) message = brief;
        }
      } catch { /* ignore parse errors */ }
      throw new Error(message);
    }

    onProgress?.(99);
    const blob = await res.blob();
    if (!blob.size) throw new Error("Server returned an empty file");

    const baseName = file.name.replace(/\.[^.]+$/, "");
    return new File([blob], `${baseName}.mp3`, { type: "audio/mpeg" });
  } finally {
    clearInterval(ticker);
  }
}
