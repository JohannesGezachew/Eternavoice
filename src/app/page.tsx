import Link from "next/link";
import { Nav } from "@/components/shell/Nav";
import { Hero } from "@/components/landing/Hero";
import { Stats } from "@/components/landing/Stats";
import { Pillars } from "@/components/landing/Pillars";
import { Pricing } from "@/components/landing/Pricing";
import { Faq } from "@/components/landing/Faq";
import { CtaBanner } from "@/components/landing/CtaBanner";

const HOW_IT_WORKS = [
  {
    step: "1",
    title: "Say who they are",
    body: "A name and, if you like, who they were to you. That's all it takes to begin.",
  },
  {
    step: "2",
    title: "Bring their voice",
    body: "Any recording you have: a voicemail, a video, a voice note. One speaker, clear speech, ninety seconds.",
  },
  {
    step: "3",
    title: "Hear them",
    body: "Listen to a first sentence in their voice and decide if it sounds right before continuing.",
  },
  {
    step: "4",
    title: "Start talking",
    body: "They speak first. Speak or type back — memories carry forward across every conversation.",
  },
];

const TRUST_SIGNALS = [
  "End-to-end encrypted",
  "No voice is ever shared",
  "GDPR compliant",
  "Cancel anytime",
];

export default function HomePage() {
  return (
    <div className="relative flex min-h-dvh flex-col bg-[var(--color-ink)] text-[var(--color-bone)]">
      <div className="grain-overlay" aria-hidden />
      <Nav />
      <main className="relative flex flex-1 flex-col">
        <Hero />
        <Stats />
        <Pillars />

        {/* How it works */}
        <section id="how-it-works" className="mx-auto w-full max-w-6xl px-6 py-16 sm:px-8 sm:py-28">
          <div className="grid gap-10 lg:grid-cols-[1fr_1.4fr] lg:items-start lg:gap-16">
            {/* Left label */}
            <div className="lg:pt-1">
              <p className="eyebrow">
                How it works
              </p>
              <h2 className="font-serif mt-4 text-[26px] leading-[1.1] text-balance text-[var(--color-bone)] sm:text-[42px]">
                From recording to first conversation.
              </h2>
              <p className="mt-5 text-[15px] leading-[1.75] text-[var(--color-bone)]/55">
                The whole setup takes under five minutes. Everything stays on your account — encrypted, private, and accessible from any device.
              </p>
            </div>

            {/* Steps grid */}
            <div className="flex flex-col gap-4">
              <div className="grid gap-px overflow-hidden rounded-2xl border border-[var(--color-rule-strong)] bg-[var(--color-rule-strong)] sm:grid-cols-2">
                {HOW_IT_WORKS.map(({ step, title, body }) => (
                  <div
                    key={step}
                    className="group bg-[var(--color-ink)] p-6 transition-colors duration-300 hover:bg-[var(--color-ink-2)] sm:p-7"
                  >
                    <span className="text-[11px] tracking-[0.22em] text-[var(--color-ember)]/70">
                      {step}
                    </span>
                    <h3 className="font-serif mt-4 text-[22px] text-[var(--color-bone)]">
                      {title}
                    </h3>
                    <p className="mt-3 text-[14px] leading-[1.7] text-[var(--color-bone)]/60 transition-colors duration-300 group-hover:text-[var(--color-bone)]/75">
                      {body}
                    </p>
                  </div>
                ))}
              </div>
              <Link
                href="/auth/login"
                className="self-start text-[13px] text-[var(--color-ember)] transition hover:opacity-75"
              >
                Start free →
              </Link>
            </div>
          </div>
        </section>

        {/* Manifesto — what this is, in our own words */}
        <section className="mx-auto w-full max-w-3xl px-6 py-16 text-center sm:px-8 sm:py-28">
          <div className="mx-auto mb-10 h-px w-10 bg-[var(--color-ember)]/50" />
          <p
            className="font-serif text-[22px] leading-[1.65] text-balance text-[var(--color-bone)]/85 sm:text-[38px]"
            style={{ fontVariationSettings: "'SOFT' 80, 'opsz' 144" }}
          >
            Not a replacement. Not a simulation. A way to keep speaking to
            someone whose voice you don&rsquo;t want to forget.
          </p>
          <div className="mx-auto mt-10 h-px w-10 bg-[var(--color-ember)]/50" />
        </section>

        <Pricing />
        <Faq />

        <CtaBanner />

        {/* Footer */}
        <footer className="mx-auto w-full max-w-6xl px-6 pb-12 sm:px-8">
          <div className="border-t border-[var(--color-rule)] pt-10">
            <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
              {/* Brand */}
              <div className="flex flex-col gap-3">
                <p className="font-serif text-[15px] text-[var(--color-bone)]">EternaVoice</p>
                <p className="max-w-[240px] text-[12px] leading-[1.7] text-[var(--color-text-secondary)]">
                  Voice conversations with someone you&rsquo;ve lost, built from their own recordings.
                </p>
              </div>

              {/* Links */}
              <div className="flex flex-wrap items-start gap-x-8 gap-y-3 text-[12px] text-[var(--color-text-secondary)]">
                <Link href="/about" className="transition hover:text-[var(--color-bone-dim)]">Why we built this</Link>
                <Link href="/auth/login" className="transition hover:text-[var(--color-bone-dim)]">Sign in</Link>
                <Link href="/terms" className="transition hover:text-[var(--color-bone-dim)]">Terms</Link>
                <Link href="/privacy" className="transition hover:text-[var(--color-bone-dim)]">Privacy</Link>
                <Link href="/privacy#cookies" className="transition hover:text-[var(--color-bone-dim)]">Cookies</Link>
                <a href="mailto:support@eternavoice.app" className="transition hover:text-[var(--color-bone-dim)]">Support</a>
              </div>
            </div>

            {/* Trust bar */}
            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2">
              {TRUST_SIGNALS.map((s) => (
                <span key={s} className="flex items-center gap-1.5 text-[11px] text-[var(--color-text-tertiary)]">
                  <svg width="10" height="10" viewBox="0 0 16 16" fill="none" aria-hidden>
                    <circle cx="8" cy="8" r="7.5" stroke="currentColor" strokeOpacity="0.5" />
                    <path d="M5 8.5l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  {s}
                </span>
              ))}
            </div>

            <p className="mt-6 text-[11px] text-[var(--color-text-tertiary)]">
              © {new Date().getFullYear()} EternaVoice. All rights reserved.
            </p>
          </div>
        </footer>
      </main>
    </div>
  );
}
