"use client";

/**
 * Per-person photo avatars, stored locally as small square data URLs. A face
 * beside the voice matters for this product, but photos never need to leave the
 * device — they live in localStorage keyed by the person's stable id.
 *
 * Uploads are downscaled and centre-cropped to 256×256 JPEG before storing, so
 * a multi-megabyte camera photo becomes a ~20–40KB string well within the
 * localStorage budget.
 */

const PREFIX = "ev-photo:";
const SIZE = 256;

export function photoKey(id: string): string {
  return `${PREFIX}${id}`;
}

export function getPhoto(id: string | null | undefined): string | null {
  if (!id || typeof window === "undefined") return null;
  try {
    return localStorage.getItem(photoKey(id));
  } catch {
    return null;
  }
}

export function setPhoto(id: string, dataUrl: string): void {
  try {
    localStorage.setItem(photoKey(id), dataUrl);
    window.dispatchEvent(new CustomEvent("ev-photo-change", { detail: { id } }));
  } catch {
    // storage full/blocked — the voiceprint remains the fallback
  }
}

export function removePhoto(id: string): void {
  try {
    localStorage.removeItem(photoKey(id));
    window.dispatchEvent(new CustomEvent("ev-photo-change", { detail: { id } }));
  } catch {
    // ignore
  }
}

/** Read a File, downscale + centre-crop to a square JPEG data URL. */
export function fileToAvatarDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(new Error("That doesn't look like an image."));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read that file."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Could not load that image."));
      img.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          canvas.width = SIZE;
          canvas.height = SIZE;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            reject(new Error("Image processing unavailable."));
            return;
          }
          // Centre-crop the largest square that fits, then scale to SIZE.
          const side = Math.min(img.width, img.height);
          const sx = (img.width - side) / 2;
          const sy = (img.height - side) / 2;
          ctx.drawImage(img, sx, sy, side, side, 0, 0, SIZE, SIZE);
          resolve(canvas.toDataURL("image/jpeg", 0.82));
        } catch {
          reject(new Error("Could not process that image."));
        }
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}
