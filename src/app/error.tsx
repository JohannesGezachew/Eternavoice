"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { reportError } from "@/lib/reportError";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
    reportError("global-error-boundary", error);
  }, [error]);

  return (
    <div className="flex min-h-dvh w-full flex-col items-center justify-center bg-[var(--color-ink)] text-[var(--color-bone)]">
      {/* Atmospheric glow */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden>
        <div
          className="absolute top-[20%] left-[50%] h-[50%] w-[50%] -translate-x-1/2 rounded-full blur-[160px]"
          style={{ background: "radial-gradient(closest-side, rgba(194,120,74,0.07), transparent 75%)" }}
        />
      </div>

      <div className="relative mx-auto flex w-full max-w-xl flex-col items-center gap-8 px-6 py-24 text-center sm:px-8">
        {/* Orb — pulsing gently to signal "alive but unsettled" */}
        <div className="relative flex h-24 w-24 items-center justify-center">
          <span
            className="absolute inset-0 rounded-full opacity-20"
            style={{
              background: "radial-gradient(closest-side, rgba(217,136,115,0.7), rgba(217,136,115,0.1) 60%, transparent)",
              animation: "waveBreath 2.5s ease-in-out infinite",
            }}
          />
          <span
            className="h-10 w-10 rounded-full"
            style={{
              background: "radial-gradient(closest-side, rgba(230,160,140,0.9), rgba(217,136,115,0.55) 50%, rgba(217,136,115,0.12))",
            }}
          />
        </div>

        <div className="flex flex-col gap-3">
          <p className="text-[11px] tracking-[0.22em] text-[var(--color-bone-dim)] uppercase">
            Something interrupted us
          </p>
          <h1 className="font-serif text-[36px] leading-[1.1] tracking-[-0.02em] text-balance text-[var(--color-bone)] sm:text-[40px]">
            We lost the thread.
          </h1>
          <p className="text-[15px] leading-[1.7] text-[var(--color-bone)]/70">
            It&apos;s rare, and it&apos;s on us. Try once more — most of the time
            the second attempt is uneventful.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button onClick={reset} variant="primary" size="md">
            Try again
          </Button>
          <Link
            href="/"
            className="inline-flex h-11 items-center px-3 text-[14px] text-[var(--color-bone-dim)] transition hover:text-[var(--color-bone)]"
          >
            Back to start
          </Link>
        </div>
      </div>
    </div>
  );
}
