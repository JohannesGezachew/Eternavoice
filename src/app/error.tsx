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
    <div className="flex min-h-dvh w-full flex-col bg-[var(--color-ink)] text-[var(--color-bone)]">
    <div className="mx-auto flex w-full max-w-xl flex-1 flex-col items-start justify-center gap-6 px-6 py-24 sm:px-8">
      <p className="text-[12px] tracking-[0.22em] text-[var(--color-bone-dim)] uppercase">
        Something interrupted us
      </p>
      <h1 className="font-serif text-[40px] leading-[1.1] tracking-[-0.02em] text-balance text-[var(--color-bone)]">
        We lost the thread.
      </h1>
      <p className="text-[15px] leading-[1.7] text-[var(--color-bone)]/70">
        It’s rare, and it’s on us. Try once more — most of the time the second
        attempt is uneventful.
      </p>
      <div className="mt-2 flex items-center gap-3">
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
