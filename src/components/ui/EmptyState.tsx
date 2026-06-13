"use client";

type EmptyVariant = "orb" | "people" | "memories" | "conversations" | "letter";

interface EmptyStateProps {
  title: string;
  body: string;
  action?: React.ReactNode;
  compact?: boolean;
  /** Which warm line illustration to show above the title. Defaults to the orb. */
  variant?: EmptyVariant;
}

/** Shared empty state: a warm line illustration, a serif title, one line of guidance. */
export function EmptyState({ title, body, action, compact = false, variant = "orb" }: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center gap-5 rounded-2xl border border-[var(--color-rule)] bg-white/[0.018] px-8 text-center ${compact ? "py-10" : "py-16"}`}
    >
      <Illustration variant={variant} />
      <div className="flex flex-col gap-2">
        <p className="font-serif text-[20px] text-[var(--color-bone)]">{title}</p>
        <p className="max-w-xs text-[13px] leading-[1.65] text-[var(--color-text-secondary)]">{body}</p>
      </div>
      {action}
    </div>
  );
}

/**
 * Bespoke, on-brand line illustrations sharing one ember glow and stroke
 * weight — warmer than a bare icon, lighter than spot art. The orb variant
 * keeps the original gradient presence for generic states.
 */
function Illustration({ variant }: { variant: EmptyVariant }) {
  if (variant === "orb") {
    return (
      <div className="relative h-14 w-14" aria-hidden>
        <div
          className="absolute inset-[-45%] rounded-full opacity-80 blur-[22px]"
          style={{ background: "radial-gradient(closest-side, var(--orb-glow-mid), transparent 75%)" }}
        />
        <div className="absolute inset-0 rounded-full border border-[var(--color-ember)]/25 bg-[radial-gradient(closest-side,var(--orb-core-lo),transparent_75%)]" />
        <div
          className="absolute inset-[26%] rounded-full bg-[radial-gradient(closest-side,var(--orb-core-mid),var(--orb-core-lo)_60%,transparent_85%)]"
          style={{ mixBlendMode: "var(--orb-blend)" as never }}
        />
      </div>
    );
  }

  return (
    <div className="relative h-16 w-16" aria-hidden>
      <div
        className="absolute inset-[-30%] rounded-full opacity-60 blur-[20px]"
        style={{ background: "radial-gradient(closest-side, var(--orb-glow-lo), transparent 75%)" }}
      />
      <svg
        viewBox="0 0 64 64"
        fill="none"
        stroke="var(--color-ember)"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="relative h-full w-full"
      >
        {variant === "people" && (
          <>
            <circle cx="24" cy="24" r="8" strokeOpacity="0.6" />
            <path d="M12 50c0-7 5-12 12-12s12 5 12 12" strokeOpacity="0.6" />
            <circle cx="44" cy="27" r="6" strokeOpacity="0.35" />
            <path d="M40 50c0-6 3-10 8-10s8 4 8 10" strokeOpacity="0.35" />
          </>
        )}
        {variant === "memories" && (
          <>
            <path d="M32 14l4.7 9.5 10.5 1.5-7.6 7.4 1.8 10.4L32 38.4l-9.4 4.9 1.8-10.4-7.6-7.4 10.5-1.5z" strokeOpacity="0.55" />
            <path d="M32 26v6l4 2" strokeOpacity="0.3" />
          </>
        )}
        {variant === "conversations" && (
          <>
            <path d="M14 18h28a4 4 0 0 1 4 4v14a4 4 0 0 1-4 4H26l-8 8V22a4 4 0 0 1 4-4z" strokeOpacity="0.55" />
            <path d="M24 27h14M24 33h9" strokeOpacity="0.32" />
          </>
        )}
        {variant === "letter" && (
          <>
            <rect x="12" y="18" width="40" height="28" rx="3" strokeOpacity="0.55" />
            <path d="M12 21l20 14 20-14" strokeOpacity="0.4" />
          </>
        )}
      </svg>
    </div>
  );
}
