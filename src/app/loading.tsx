export default function Loading() {
  return (
    <div className="mx-auto flex w-full max-w-xl flex-1 items-center justify-center px-6 py-24">
      <div className="flex items-center gap-3 text-[12px] tracking-[0.22em] text-[var(--color-bone-dim)] uppercase">
        <span className="relative inline-flex h-1.5 w-1.5">
          <span className="absolute inset-[-6px] animate-ping rounded-full bg-[var(--color-ember)]/20" />
          <span className="relative h-1.5 w-1.5 rounded-full bg-[var(--color-ember)]/80" />
        </span>
        <span>Loading</span>
      </div>
    </div>
  );
}
