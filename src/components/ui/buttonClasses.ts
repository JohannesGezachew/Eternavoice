import { cn } from "@/lib/utils";

export type ButtonVariant = "primary" | "ghost" | "outline" | "danger";
export type ButtonSize = "md" | "lg";

const base =
  "group relative inline-flex cursor-pointer items-center justify-center gap-2.5 select-none rounded-full font-medium tracking-tight transition-[transform,background,color,border-color,box-shadow,opacity] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] disabled:pointer-events-none disabled:opacity-40";

const variants: Record<ButtonVariant, string> = {
  primary:
    "bg-[var(--color-bone)] text-[var(--color-ink)] hover:bg-[var(--color-bone-2)] active:scale-[0.985] shadow-[0_1px_0_rgba(255,255,255,0.4)_inset,0_12px_40px_-16px_rgba(194,120,74,0.5)]",
  ghost:
    "bg-transparent text-[var(--color-bone)]/80 hover:text-[var(--color-bone)] hover:bg-white/[0.03]",
  outline:
    "border border-[var(--color-rule-strong)] bg-white/[0.02] text-[var(--color-bone)]/90 hover:bg-white/[0.04] hover:border-[var(--color-ember)]/40",
  danger:
    "border border-[var(--color-danger)]/40 bg-[var(--color-danger)]/15 text-[var(--color-danger)] hover:bg-[var(--color-danger)]/25",
};

const sizes: Record<ButtonSize, string> = {
  md: "h-11 px-5 text-[14px]",
  lg: "h-14 px-8 text-[15px]",
};

/**
 * Pure className builder — no React, no browser APIs. Safe to call from
 * either server components or client components.
 */
export function buttonClasses(
  opts: { variant?: ButtonVariant; size?: ButtonSize; className?: string } = {},
) {
  const { variant = "primary", size = "md", className } = opts;
  return cn(base, variants[variant], sizes[size], className);
}
