"use client";

import { forwardRef } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { buttonClasses, type ButtonVariant, type ButtonSize } from "./buttonClasses";

export { buttonClasses } from "./buttonClasses";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
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
