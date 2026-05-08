import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Tone = "default" | "raised" | "well";

interface SurfaceProps extends HTMLAttributes<HTMLDivElement> {
  tone?: Tone;
}

const tones: Record<Tone, string> = {
  default: "bg-white/[0.015] hairline",
  raised:
    "bg-[var(--color-ink-2)]/80 backdrop-blur-xl hairline-strong shadow-[0_30px_80px_-40px_rgba(0,0,0,0.7)]",
  well: "bg-[var(--color-ink)]/60 hairline",
};

export function Surface({ tone = "default", className, children, ...rest }: SurfaceProps) {
  return (
    <div className={cn("rounded-2xl", tones[tone], className)} {...rest}>
      {children}
    </div>
  );
}
