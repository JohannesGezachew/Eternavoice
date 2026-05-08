"use client";

import { forwardRef } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "ghost" | "outline";
type Size = "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
}

const base =
  "group relative inline-flex items-center justify-center gap-2.5 select-none rounded-full font-medium tracking-tight transition-[transform,background,color,border-color,box-shadow,opacity] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] disabled:pointer-events-none disabled:opacity-40";

const variants: Record<Variant, string> = {
  primary:
    "bg-[var(--color-bone)] text-[var(--color-ink)] hover:bg-[var(--color-bone-2)] active:scale-[0.985] shadow-[0_1px_0_rgba(255,255,255,0.4)_inset,0_12px_40px_-16px_rgba(199,162,124,0.5)]",
  ghost:
    "bg-transparent text-[var(--color-bone)]/80 hover:text-[var(--color-bone)] hover:bg-white/[0.03]",
  outline:
    "border border-[var(--color-rule-strong)] bg-white/[0.02] text-[var(--color-bone)]/90 hover:bg-white/[0.04] hover:border-[var(--color-ember)]/40",
};

const sizes: Record<Size, string> = {
  md: "h-11 px-5 text-[14px]",
  lg: "h-14 px-8 text-[15px]",
};

export function buttonClasses(opts: { variant?: Variant; size?: Size; className?: string } = {}) {
  const { variant = "primary", size = "md", className } = opts;
  return cn(base, variants[variant], sizes[size], className);
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", loading, iconLeft, iconRight, className, children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      className={buttonClasses({ variant, size, className })}
      data-loading={loading || undefined}
      {...rest}
    >
      {iconLeft ? <span className="-ml-1 flex shrink-0">{iconLeft}</span> : null}
      <span className={cn("relative", loading && "opacity-0")}>{children}</span>
      {iconRight ? <span className="-mr-1 flex shrink-0">{iconRight}</span> : null}
      {loading ? (
        <span
          className="absolute inset-0 flex items-center justify-center"
          aria-hidden
        >
          <svg
            className="h-4 w-4 animate-spin opacity-70"
            viewBox="0 0 24 24"
            fill="none"
          >
            <circle
              cx="12"
              cy="12"
              r="9"
              stroke="currentColor"
              strokeOpacity="0.2"
              strokeWidth="2"
            />
            <path
              d="M21 12a9 9 0 0 0-9-9"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </span>
      ) : null}
    </button>
  );
});
