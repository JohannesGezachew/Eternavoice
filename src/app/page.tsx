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
            “The relationship grows over time. It feels like them.”
          </p>
          <p className="mt-4 text-[12px] tracking-[0.18em] text-[var(--color-bone-dim)] uppercase">
            from the v1 scope
          </p>
        </section>
        <footer className="mx-auto w-full max-w-6xl px-6 pb-12 sm:px-8">
          <div className="hairline rounded-2xl px-6 py-5">
            <div className="flex flex-col items-start justify-between gap-3 text-[12px] text-[var(--color-bone-dim)] sm:flex-row sm:items-center">
              <span>EternaVoice · Confidential preview · May 2026</span>
              <Link
                href="/record"
                className="text-[var(--color-bone)]/80 transition hover:text-[var(--color-ember)]"
              >
                Begin →
              </Link>
            </div>
          </div>
        </footer>
      </main>
    </>
  );
}
