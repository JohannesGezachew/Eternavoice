"use client";

import { useEffect, useRef, useState } from "react";
import { VoicePrint } from "./VoicePrint";
import { getPhoto, setPhoto, removePhoto, fileToAvatarDataUrl } from "@/lib/photo";
import { haptic } from "@/lib/haptics";

interface PersonAvatarProps {
  /** Stable id for photo storage — subjectId preferred, else voiceId. */
  id: string | null | undefined;
  /** Seed for the generative voiceprint fallback. */
  seed: string;
  size?: number;
  initial?: string;
  animated?: boolean;
  /** When true, the avatar is a button that uploads / changes the photo. */
  editable?: boolean;
  className?: string;
}

/**
 * A person's face when they have one, their generative voiceprint when they
 * don't. Photos are local-only (see lib/photo). When editable, clicking opens
 * a file picker; an existing photo can be removed to return to the voiceprint.
 */
export function PersonAvatar({
  id,
  seed,
  size = 56,
  initial,
  animated = true,
  editable = false,
  className,
}: PersonAvatarProps) {
  const [photo, setPhotoState] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Read once on mount and stay in sync with edits made elsewhere.
  useEffect(() => {
    setPhotoState(getPhoto(id));
    if (!id) return;
    const onChange = (e: Event) => {
      const detail = (e as CustomEvent<{ id: string }>).detail;
      if (detail?.id === id) setPhotoState(getPhoto(id));
    };
    window.addEventListener("ev-photo-change", onChange);
    return () => window.removeEventListener("ev-photo-change", onChange);
  }, [id]);

  const onPick = async (file: File | undefined) => {
    if (!file || !id) return;
    setBusy(true);
    try {
      const dataUrl = await fileToAvatarDataUrl(file);
      setPhoto(id, dataUrl);
      haptic("save");
    } catch {
      // keep the voiceprint on failure
    } finally {
      setBusy(false);
    }
  };

  const img = photo ? (
    // A local data-URL avatar — next/image offers no optimisation for these
    // and would force unoptimized; a plain img is correct here.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={photo}
      alt=""
      className="absolute inset-0 h-full w-full rounded-full object-cover"
      style={{ width: size, height: size }}
    />
  ) : (
    <VoicePrint seed={seed} size={size} initial={initial} animated={animated} />
  );

  if (!editable) {
    return <span className={className}>{img}</span>;
  }

  return (
    <span className={`group/avatar relative inline-block ${className ?? ""}`} style={{ width: size, height: size }}>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => void onPick(e.target.files?.[0])}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        aria-label={photo ? "Change photo" : "Add a photo"}
        className="relative block h-full w-full cursor-pointer rounded-full"
      >
        {img}
        {/* Hover/focus camera affordance */}
        <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/45 opacity-0 transition-opacity duration-200 group-hover/avatar:opacity-100">
          {busy ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
              <circle cx="12" cy="13" r="4" />
            </svg>
          )}
        </span>
      </button>
      {photo && (
        <button
          type="button"
          onClick={() => { if (id) { removePhoto(id); haptic("tap"); } }}
          aria-label="Remove photo"
          className="absolute -right-1 -top-1 flex h-5 w-5 cursor-pointer items-center justify-center rounded-full border border-[var(--color-rule-strong)] bg-[var(--color-ink-2)] text-[var(--color-bone-dim)] opacity-0 transition hover:text-[var(--color-danger)] group-hover/avatar:opacity-100"
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      )}
    </span>
  );
}
