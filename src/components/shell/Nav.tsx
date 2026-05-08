import Link from "next/link";
import { Mark } from "./Mark";

export function Nav() {
  return (
    <header className="relative z-20">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6 sm:px-8 sm:py-8">
        <Link href="/" aria-label="EternaVoice home" className="-mx-1 px-1">
          <Mark />
        </Link>
        <nav className="flex items-center gap-7 text-[13px] text-[var(--color-bone-dim)]">
          <span className="hidden sm:inline">Confidential preview</span>
          <span className="hidden h-3 w-px bg-[var(--color-rule-strong)] sm:block" />
          <span className="hidden sm:inline">v1 · demo</span>
        </nav>
      </div>
    </header>
  );
}
