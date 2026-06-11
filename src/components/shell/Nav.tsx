"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Mark } from "./Mark";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

export function Nav() {
  const router = useRouter();
  const [scrolled, setScrolled] = useState(false);
  const [user, setUser] = useState<{ email?: string } | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user: u } }) => setUser(u));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setMenuOpen(false); };
    if (menuOpen) {
      document.addEventListener("keydown", onKey);
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

  const signOut = async () => {
    setSigningOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
  };

  const authedMobileLinks = [
    { label: "Voices", href: "/voices" },
    { label: "History", href: "/conversations" },
    { label: "Account", href: "/account" },
  ];

  const guestMobileLinks = [
    { label: "How it works", href: "/#how-it-works" },
    { label: "Pricing", href: "/#pricing" },
    { label: "Privacy", href: "/privacy" },
  ];

  return (
    <>
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
            {user ? (
              <>
                <Link href="/voices" className="hidden transition duration-200 hover:text-[var(--color-bone)] sm:inline">
                  Voices
                </Link>
                <Link href="/conversations" className="hidden transition duration-200 hover:text-[var(--color-bone)] sm:inline">
                  History
                </Link>
                <Link href="/account" className="hidden transition duration-200 hover:text-[var(--color-bone)] sm:inline">
                  Account
                </Link>
                <button
                  onClick={() => void signOut()}
                  disabled={signingOut}
                  className="hidden transition duration-200 hover:text-[var(--color-bone)] disabled:opacity-50 sm:inline"
                >
                  {signingOut ? "Signing out…" : "Sign out"}
                </button>
                {/* Desktop CTA */}
                <Link
                  href="/voices"
                  className="hidden sm:inline-flex h-9 cursor-pointer items-center justify-center rounded-full border border-[var(--color-rule-strong)] px-4 text-[12px] tracking-[0.03em] text-[var(--color-bone)]/80 transition duration-300 hover:border-[var(--color-ember)]/50 hover:text-[var(--color-bone)]"
                >
                  My voices
                </Link>
                {/* Mobile hamburger */}
                <button
                  onClick={() => setMenuOpen(true)}
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-[var(--color-bone-dim)] transition hover:text-[var(--color-bone)] sm:hidden"
                  aria-label="Open menu"
                >
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
                    <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </button>
              </>
            ) : (
              <>
                <Link href="/#pricing" className="hidden transition duration-200 hover:text-[var(--color-bone)] sm:inline">
                  Pricing
                </Link>
                <Link href="/privacy" className="hidden transition duration-200 hover:text-[var(--color-bone)] sm:inline">
                  Privacy
                </Link>
                <Link
                  href="/auth/login"
                  className="hidden h-9 cursor-pointer items-center justify-center rounded-full border border-[var(--color-rule-strong)] px-4 text-[12px] tracking-[0.03em] text-[var(--color-bone)]/80 transition duration-300 hover:border-[var(--color-ember)]/50 hover:text-[var(--color-bone)] sm:inline-flex"
                >
                  Sign in
                </Link>
                {/* Mobile hamburger */}
                <button
                  onClick={() => setMenuOpen(true)}
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-[var(--color-bone-dim)] transition hover:text-[var(--color-bone)] sm:hidden"
                  aria-label="Open menu"
                >
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
                    <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </button>
              </>
            )}
          </nav>
        </div>
      </header>

      {/* Mobile overlay menu */}
      <AnimatePresence>
        {menuOpen && (
          <motion.div
            key="mobile-menu"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            role="dialog"
            aria-modal="true"
            aria-label="Navigation menu"
            className="fixed inset-0 z-[100] flex flex-col"
            style={{ backgroundColor: "#0a0a0d" }}
          >
            {/* Ambient ember glow at the top — depth without translucency */}
            <div
              className="pointer-events-none absolute inset-x-0 top-0 h-64"
              aria-hidden
              style={{
                background:
                  "radial-gradient(ellipse 90% 100% at 50% 0%, rgba(201,153,106,0.12), transparent 70%)",
              }}
            />
            <motion.div
              initial={{ opacity: 0, y: -16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              className="flex flex-1 flex-col"
            >
              {/* Top bar */}
              <div className="flex items-center justify-between px-6 py-6">
                <Link href="/" onClick={() => setMenuOpen(false)}>
                  <Mark />
                </Link>
                <button
                  onClick={() => setMenuOpen(false)}
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-[var(--color-bone-dim)] transition hover:text-[var(--color-bone)]"
                  aria-label="Close menu"
                >
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
                    <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </button>
              </div>

              {/* Links */}
              <nav className="flex flex-1 flex-col justify-center gap-2 px-6">
                {(user ? authedMobileLinks : guestMobileLinks).map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMenuOpen(false)}
                    className="py-3.5 font-serif text-[26px] leading-tight tracking-[-0.01em] text-[var(--color-bone)]/80 transition hover:text-[var(--color-bone)]"
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>

              {/* Bottom CTA */}
              <div className="mt-auto px-6 pb-12" style={{ paddingBottom: "max(3rem, env(safe-area-inset-bottom))" }}>
                {user ? (
                  <button
                    onClick={() => { setMenuOpen(false); void signOut(); }}
                    disabled={signingOut}
                    className="flex h-12 w-full items-center justify-center rounded-xl border border-[var(--color-rule-strong)] text-[14px] text-[var(--color-bone-dim)] transition hover:text-[var(--color-bone)] disabled:opacity-50"
                  >
                    {signingOut ? "Signing out…" : "Sign out"}
                  </button>
                ) : (
                  <Link
                    href="/auth/login"
                    onClick={() => setMenuOpen(false)}
                    className="flex h-12 w-full items-center justify-center rounded-xl bg-[var(--color-ember)] text-[14px] font-medium text-[var(--color-ink)] shadow-[0_8px_24px_-8px_rgba(201,153,106,0.55)] transition hover:opacity-90"
                  >
                    Sign in
                  </Link>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
