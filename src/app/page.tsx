import Link from "next/link";
import { Nav } from "@/components/shell/Nav";
import { Hero } from "@/components/landing/Hero";
import { Pillars } from "@/components/landing/Pillars";

export default function HomePage() {
  return (
    <>
      <Nav />
      <main className="relative flex flex-1 flex-col">
        <Hero />
        <Pillars />
        <section className="mx-auto w-full max-w-3xl px-6 py-24 text-center sm:px-8">
          <p className="font-serif text-[20px] leading-[1.65] text-balance text-[var(--color-bone)]/80 sm:text-[24px]">
            Built for quiet, private conversations with a voice you choose to preserve.
          </p>
        </section>
        <footer className="mx-auto w-full max-w-6xl px-6 pb-12 sm:px-8">
          <div className="hairline rounded-2xl px-6 py-5">
            <div className="flex flex-col items-start justify-between gap-3 text-[12px] text-[var(--color-bone-dim)] sm:flex-row sm:items-center">
              <span>EternaVoice</span>
              <div className="flex flex-wrap items-center gap-4">
                <Link href="/terms" className="transition hover:text-[var(--color-bone)]">
                  Terms
                </Link>
                <Link href="/privacy" className="transition hover:text-[var(--color-bone)]">
                  Privacy
                </Link>
                <Link
                  href="/record"
                  className="text-[var(--color-bone)]/80 transition hover:text-[var(--color-ember)]"
                >
                  Begin →
                </Link>
              </div>
            </div>
          </div>
        </footer>
      </main>
    </>
  );
}
