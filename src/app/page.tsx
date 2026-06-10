import Link from "next/link";
import { Nav } from "@/components/shell/Nav";
import { Hero } from "@/components/landing/Hero";
import { Stats } from "@/components/landing/Stats";
import { Pillars } from "@/components/landing/Pillars";
import { Testimonials } from "@/components/landing/Testimonials";
import { Pricing } from "@/components/landing/Pricing";
import { Faq } from "@/components/landing/Faq";
import { CtaBanner } from "@/components/landing/CtaBanner";

const HOW_IT_WORKS = [
  {
    step: "1",
    title: "Name the voice",
    body: "Give the clone a name before anything is created. It can be their first name, a nickname — whatever feels right.",
  },
  {
    step: "2",
    title: "Upload or record",
    body: "Use any recording you have: a voicemail, a video, a voice note. One speaker, clear speech, a quiet room.",
  },
  {
    step: "3",
    title: "Preview the clone",
    body: "Listen to a generated sample and decide if it sounds right before continuing.",
  },
  {
    step: "4",
    title: "Start the conversation",
    body: "Speak or type. The persona responds as them — memory carries forward across every session.",
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
    <>
      <Nav />
      <main className="relative flex flex-1 flex-col">
        <Hero />
        <Stats />
        <Pillars />

        {/* How it works */}
        <section id="how-it-works" className="mx-auto w-full max-w-6xl px-6 py-24 sm:px-8 sm:py-32">
          <div className="grid gap-10 lg:grid-cols-[1fr_1.4fr] lg:items-start lg:gap-16">
            {/* Left label */}
            <div className="lg:pt-1">
              <p className="flex items-center gap-2.5 text-[12px] tracking-[0.22em] text-[var(--color-bone-dim)] uppercase">
                <span className="inline-block h-1 w-1 rounded-full bg-[var(--color-ember)]" aria-hidden />
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

        <Testimonials />

        {/* Pull-quote */}
        <section className="mx-auto w-full max-w-3xl px-6 py-24 text-center sm:px-8">
          <div className="mx-auto mb-10 h-px w-10 bg-[var(--color-ember)]/50" />
          <p
            className="font-serif text-[22px] leading-[1.65] text-balance text-[var(--color-bone)]/85 sm:text-[38px]"
            style={{ fontVariationSettings: "'SOFT' 80, 'opsz' 144" }}
          >
            Not a replacement. Not a simulation. A way to keep speaking to
            someone whose voice you don&rsquo;t want to forget.
          </p>
          <div className="mx-auto mt-10 h-px w-10 bg-[var(--color-ember)]/50" />
          <p className="mt-6 text-[13px] tracking-[0.06em] text-[var(--color-bone-dim)]/65">
            — Sarah O., remembering her father
          </p>
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
                <p className="max-w-[240px] text-[12px] leading-[1.7] text-[var(--color-bone-dim)]/70">
                  Voice conversations with someone you&rsquo;ve lost, built from their own recordings.
                </p>
              </div>

              {/* Links */}
              <div className="flex flex-wrap items-start gap-x-8 gap-y-3 text-[12px] text-[var(--color-bone-dim)]/60">
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
                <span key={s} className="flex items-center gap-1.5 text-[11px] text-[var(--color-bone-dim)]/70">
                  <svg width="10" height="10" viewBox="0 0 16 16" fill="none" aria-hidden>
                    <circle cx="8" cy="8" r="7.5" stroke="currentColor" strokeOpacity="0.5" />
                    <path d="M5 8.5l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  {s}
                </span>
              ))}
            </div>

            <p className="mt-6 text-[11px] text-[var(--color-bone-dim)]/65">
              © {new Date().getFullYear()} EternaVoice. All rights reserved.
            </p>
          </div>
        </footer>
      </main>
    </>
  );
}
