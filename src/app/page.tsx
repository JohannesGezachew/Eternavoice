import Link from "next/link";
import { Nav } from "@/components/shell/Nav";
import { Hero } from "@/components/landing/Hero";
import { Pillars } from "@/components/landing/Pillars";
import { Testimonials } from "@/components/landing/Testimonials";
import { CtaBanner } from "@/components/landing/CtaBanner";

export default function HomePage() {
  return (
    <>
      <Nav />
      <main className="relative flex flex-1 flex-col">
        <Hero />
        <Pillars />
        <section className="mx-auto w-full max-w-6xl px-6 py-20 sm:px-8">
          <div className="grid gap-8 lg:grid-cols-[0.75fr_1.25fr] lg:items-start">
            <div>
              <p className="flex items-center gap-2.5 text-[12px] tracking-[0.22em] text-[var(--color-bone-dim)] uppercase">
                <span
                  className="inline-block h-1 w-1 rounded-full bg-[var(--color-ember)]"
                  aria-hidden
                />
                How it works
              </p>
              <h2 className="font-serif mt-4 text-[34px] leading-[1.1] text-[var(--color-bone)] sm:text-[44px]">
                From recording to first conversation.
              </h2>
            </div>
            <div className="grid gap-px overflow-hidden rounded-2xl border border-[var(--color-rule-strong)] bg-[var(--color-rule-strong)] sm:grid-cols-2">
              {[
                ["1", "Name the voice", "Give the clone a clear label before anything is created."],
                ["2", "Upload or record", "Use one speaker, clean speech, and a quiet room whenever possible."],
                ["3", "Preview the clone", "Listen to a generated sample and improve it if it feels wrong."],
                ["4", "Talk or type", "Start a spoken conversation, open the transcript, or use text mode."],
              ].map(([step, title, body]) => (
                <div
                  key={step}
                  className="group bg-[var(--color-ink)]/85 p-6 transition-colors duration-300 hover:bg-[var(--color-ink-2)]/90 sm:p-7"
                >
                  <span className="text-[11px] tracking-[0.22em] text-[var(--color-ember)] transition-colors duration-300 group-hover:text-[var(--color-ember-soft)]">
                    {step}
                  </span>
                  <h3 className="font-serif mt-4 text-[23px] text-[var(--color-bone)]">
                    {title}
                  </h3>
                  <p className="mt-3 text-[14px] leading-[1.7] text-[var(--color-bone)]/65 transition-colors duration-300 group-hover:text-[var(--color-bone)]/80">
                    {body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>
        <Testimonials />
        <section className="mx-auto w-full max-w-3xl px-6 py-28 text-center sm:px-8">
          <div className="mx-auto mb-10 h-px w-10 bg-[var(--color-ember)]/55" />
          <p
            className="font-serif text-[28px] leading-[1.6] text-balance text-[var(--color-bone)]/85 sm:text-[40px]"
            style={{ fontVariationSettings: "'SOFT' 80, 'opsz' 144" }}
          >
            Not a replacement. Not a simulation. A way to keep speaking to
            someone whose voice you don&rsquo;t want to forget.
          </p>
          <div className="mx-auto mt-10 h-px w-10 bg-[var(--color-ember)]/55" />
        </section>
        <CtaBanner />
        <footer className="mx-auto w-full max-w-6xl px-6 pb-12 sm:px-8">
          <div className="border-t border-[var(--color-rule)] pt-8">
            <div className="flex flex-col items-start justify-between gap-3 text-[12px] text-[var(--color-bone-dim)] sm:flex-row sm:items-center">
              <span>EternaVoice</span>
              <div className="flex flex-wrap items-center gap-4">
                <Link href="/terms" className="transition hover:text-[var(--color-bone)]">
                  Terms
                </Link>
                <Link href="/privacy" className="transition hover:text-[var(--color-bone)]">
                  Privacy
                </Link>
              </div>
            </div>
          </div>
        </footer>
      </main>
    </>
  );
}
