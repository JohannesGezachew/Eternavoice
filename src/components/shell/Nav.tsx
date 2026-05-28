"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Mark } from "./Mark";
import { cn } from "@/lib/utils";

export function Nav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "sticky top-0 z-50 transition-all duration-500",
        scrolled
          ? "border-b border-[var(--color-rule)] bg-[var(--color-ink)]/75 backdrop-blur-xl"
          : "",
      )}
    >
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6 sm:px-8 sm:py-8">
        <Link href="/" aria-label="EternaVoice home" className="-mx-1 px-1">
          <Mark />
        </Link>
        <nav className="flex items-center gap-6 text-[13px] text-[var(--color-bone-dim)]">
          <Link
            href="/voices"
            className="hidden transition duration-200 hover:text-[var(--color-bone)] sm:inline"
          >
            Voices
          </Link>
          <Link
            href="/conversations"
            className="hidden transition duration-200 hover:text-[var(--color-bone)] sm:inline"
          >
            History
          </Link>
          <Link
            href="/privacy"
            className="hidden transition duration-200 hover:text-[var(--color-bone)] sm:inline"
          >
            Privacy
          </Link>
          <Link
            href="/record"
            className="inline-flex h-9 cursor-pointer items-center justify-center rounded-full border border-[var(--color-rule-strong)] px-4 text-[12px] tracking-[0.03em] text-[var(--color-bone)]/80 transition duration-300 hover:border-[var(--color-ember)]/50 hover:text-[var(--color-bone)]"
          >
            Begin
          </Link>
        </nav>
      </div>
    </header>
  );
}
