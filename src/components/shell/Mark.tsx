import { cn } from "@/lib/utils";

export function Mark({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-2.5 select-none", className)}>
      <span
        aria-hidden
        className="relative inline-flex h-6 w-6 items-center justify-center"
      >
        <span className="absolute inset-0 rounded-full bg-[var(--color-ember)]/10" />
        <span className="absolute inset-[5px] rounded-full bg-[var(--color-ember)]/30" />
        <span className="relative h-1.5 w-1.5 rounded-full bg-[var(--color-ember)]" />
      </span>
      <span className="font-serif text-[17px] tracking-[-0.01em] text-[var(--color-bone)]">
        EternaVoice
      </span>
    </div>
  );
}
