import Link from "next/link";
import { PeopleLibrary } from "@/components/people/PeopleLibrary";
import { AppShell } from "@/components/shell/AppShell";

export const metadata = {
  title: "Your people · EternaVoice",
};

export default function PeoplePage() {
  return (
    <AppShell
      rightAction={
        <Link
          href="/people/new"
          className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full border border-[var(--color-rule-strong)] px-3.5 text-[12px] text-[var(--color-bone)]/85 transition hover:border-[var(--color-ember)]/40 hover:text-[var(--color-bone)]"
        >
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden>
            <path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          New person
        </Link>
      }
    >
      <PeopleLibrary />
    </AppShell>
  );
}
