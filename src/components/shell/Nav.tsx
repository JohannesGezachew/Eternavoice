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
          <Link href="/voices" className="transition hover:text-[var(--color-bone)]">
            Voices
          </Link>
          <span className="hidden h-3 w-px bg-[var(--color-rule-strong)] sm:block" />
          <Link href="/conversations" className="hidden transition hover:text-[var(--color-bone)] sm:inline">
            Conversations
          </Link>
          <span className="hidden h-3 w-px bg-[var(--color-rule-strong)] sm:block" />
          <Link href="/privacy" className="hidden transition hover:text-[var(--color-bone)] sm:inline">
            Privacy
          </Link>
        </nav>
      </div>
    </header>
  );
}
