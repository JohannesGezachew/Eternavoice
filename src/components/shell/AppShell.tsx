"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Mark } from "./Mark";
import { DbHydrator } from "./DbHydrator";

interface AppShellProps {
  children: React.ReactNode;
  title?: string;
  backHref?: string;
  /** When the back arrow should act in-page (e.g. wizard step-back) instead
   *  of navigating. Takes precedence over backHref. */
  onBack?: () => void;
  rightAction?: React.ReactNode;
  showTabs?: boolean;
}

const TABS = [
  {
    href: "/people",
    label: "People",
    match: (p: string) => p.startsWith("/people") && !p.endsWith("/talk"),
    icon: (active: boolean) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth={active ? 2 : 1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <circle cx="8" cy="7" r="3.5" />
        <path d="M2 21c0-3.5 2.5-6 6-6" />
        <circle cx="16" cy="7" r="3" />
        <path d="M12.5 15.5c2 0 5 1.5 5 5.5" />
        <path d="M2 21h9M13 21h9" />
      </svg>
    ),
  },
  // No "Talk" tab: talking is an action on a person, not a place. The
  // people page is the way in, which keeps the tab bar honest.
  {
    href: "/account",
    label: "Account",
    match: (p: string) => p === "/account",
    icon: (active: boolean) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth={active ? 2 : 1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 20c0-4.5 3.6-7.5 8-7.5s8 3 8 7.5" />
      </svg>
    ),
  },
];

export function AppShell({
  children,
  title,
  backHref,
  onBack,
  rightAction,
  showTabs = true,
}: AppShellProps) {
  const pathname = usePathname();

  const backIcon = (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M19 12H5M11 6l-6 6 6 6" />
    </svg>
  );
  const backClasses =
    "flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-[var(--color-bone-dim)] transition hover:text-[var(--color-bone)]";

  return (
    <div className="relative flex min-h-dvh flex-col bg-[var(--color-ink-2)] text-[var(--color-bone)]">
      <DbHydrator />
      {/* Top bar */}
      <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center border-b border-[var(--color-rule)] bg-[var(--color-ink-2)]/95 backdrop-blur-lg">
        <div className="flex flex-1 items-center gap-3 px-4 sm:px-6">
          {onBack ? (
            <button type="button" onClick={onBack} className={backClasses} aria-label="Go back">
              {backIcon}
            </button>
          ) : backHref ? (
            <Link href={backHref} className={backClasses} aria-label="Go back">
              {backIcon}
            </Link>
          ) : (
            <Link href="/people" aria-label="Home">
              <Mark />
            </Link>
          )}
          {title && (
            <span className="text-[14px] font-medium text-[var(--color-bone)]">{title}</span>
          )}
        </div>

        {/* Desktop nav links */}
        {showTabs && (
          <nav className="hidden items-center gap-6 px-6 text-[12px] text-[var(--color-bone-dim)] sm:flex">
            {TABS.map(({ href, label, match }) => {
              const active = match(pathname);
              return (
                <Link
                  key={href}
                  href={href}
                  className={`transition duration-200 ${active ? "text-[var(--color-bone)]" : "hover:text-[var(--color-bone)]"}`}
                >
                  {label}
                </Link>
              );
            })}
          </nav>
        )}

        {rightAction && (
          <div className="flex shrink-0 items-center pr-4 sm:pr-6">
            {rightAction}
          </div>
        )}
      </header>

      {/* Page content */}
      <div className={`flex flex-1 flex-col ${showTabs ? "pb-[calc(4rem+env(safe-area-inset-bottom))] sm:pb-0" : ""}`}>
        {children}
      </div>

      {/* Bottom tab bar — mobile only */}
      {showTabs && (
        <nav
          className="fixed bottom-0 left-0 right-0 z-30 flex border-t border-[var(--color-rule)] bg-[var(--color-ink-2)]/95 backdrop-blur-xl sm:hidden"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
          aria-label="App navigation"
        >
          {TABS.map(({ href, label, match, icon }) => {
            const active = match(pathname);
            return (
              <Link
                key={href}
                href={href}
                className={`flex flex-1 flex-col items-center justify-center gap-1 py-2.5 transition-colors ${
                  active
                    ? "text-[var(--color-ember)]"
                    : "text-[var(--color-bone-dim)]/80 hover:text-[var(--color-bone-dim)]"
                }`}
              >
                {icon(active)}
                <span className="text-[10px] tracking-[0.03em]">{label}</span>
              </Link>
            );
          })}
        </nav>
      )}
    </div>
  );
}
