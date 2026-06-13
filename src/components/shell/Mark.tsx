import { cn } from "@/lib/utils";

export function Mark({ className }: { className?: string }) {
  return (
    <div className={cn("group/mark flex items-center gap-2.5 select-none", className)}>
      <svg
        width="22"
        height="22"
        viewBox="0 0 22 22"
        fill="none"
        aria-hidden
        className="shrink-0 transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover/mark:scale-[1.12]"
      >
        <circle
          cx="11"
          cy="11"
          r="10"
          stroke="rgba(194,120,74,0.14)"
          strokeWidth="0.75"
          className="transition-all duration-700 group-hover/mark:[stroke:rgba(194,120,74,0.28)]"
        />
        <circle
          cx="11"
          cy="11"
          r="5.5"
          fill="rgba(194,120,74,0.12)"
          className="transition-all duration-700 group-hover/mark:[fill:rgba(194,120,74,0.24)]"
        />
        <circle
          cx="11"
          cy="11"
          r="2.5"
          fill="rgba(194,120,74,0.82)"
          className="transition-all duration-700 group-hover/mark:[fill:rgba(194,120,74,1)]"
        />
      </svg>
      <span className="font-serif text-[17px] tracking-[-0.01em] text-[var(--color-bone)]">
        EternaVoice
      </span>
    </div>
  );
}
