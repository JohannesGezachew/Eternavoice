"use client";

interface EmptyStateProps {
  title: string;
  body: string;
  action?: React.ReactNode;
  compact?: boolean;
}

/** Shared empty state: the brand orb, a serif title, one line of guidance. */
export function EmptyState({ title, body, action, compact = false }: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center gap-5 rounded-2xl border border-[var(--color-rule)] bg-white/[0.018] px-8 text-center ${compact ? "py-10" : "py-16"}`}
    >
      <div className="relative h-14 w-14" aria-hidden>
        <div
          className="absolute inset-[-45%] rounded-full opacity-80 blur-[22px]"
          style={{ background: "radial-gradient(closest-side, rgba(201,153,106,0.5), transparent 75%)" }}
        />
        <div className="absolute inset-0 rounded-full border border-[var(--color-ember)]/25 bg-[radial-gradient(closest-side,rgba(201,153,106,0.16),transparent_75%)]" />
        <div className="absolute inset-[26%] rounded-full bg-[radial-gradient(closest-side,rgba(245,239,230,0.5),rgba(201,153,106,0.2)_60%,transparent_85%)] mix-blend-screen" />
      </div>
      <div className="flex flex-col gap-2">
        <p className="font-serif text-[20px] text-[var(--color-bone)]">{title}</p>
        <p className="max-w-xs text-[13px] leading-[1.65] text-[var(--color-text-secondary)]">{body}</p>
      </div>
      {action}
    </div>
  );
}
