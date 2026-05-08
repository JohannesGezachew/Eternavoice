"use client";

import { forwardRef } from "react";
import type { InputHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const baseField =
  "w-full rounded-xl bg-white/[0.025] px-4 py-3 text-[15px] text-[var(--color-bone)] placeholder:text-[var(--color-bone-dim)]/60 transition-[background,border-color,box-shadow] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hairline focus:bg-white/[0.04] focus:border-[var(--color-ember)]/40 focus:outline-none";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...rest }, ref) {
    return <input ref={ref} className={cn(baseField, className)} {...rest} />;
  },
);

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...rest }, ref) {
  return (
    <textarea
      ref={ref}
      className={cn(baseField, "resize-none leading-relaxed", className)}
      {...rest}
    />
  );
});

export function Label({
  children,
  htmlFor,
  hint,
}: {
  children: React.ReactNode;
  htmlFor?: string;
  hint?: string;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className="flex items-baseline justify-between gap-3 pb-2 text-[12px] tracking-[0.14em] text-[var(--color-bone-dim)] uppercase"
    >
      <span>{children}</span>
      {hint ? <span className="text-[11px] tracking-normal normal-case opacity-60">{hint}</span> : null}
    </label>
  );
}
