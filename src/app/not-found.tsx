import Link from "next/link";
import { Nav } from "@/components/shell/Nav";
import { buttonClasses } from "@/components/ui/buttonClasses";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh w-full flex-col bg-[var(--color-ink)] text-[var(--color-bone)]">
      <Nav />

      {/* Atmospheric glow — same treatment as the talk room */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden>
        <div
          className="absolute top-[20%] left-[50%] h-[50%] w-[50%] -translate-x-1/2 rounded-full blur-[160px]"
          style={{ background: "radial-gradient(closest-side, rgba(194,120,74,0.08), transparent 75%)" }}
        />
      </div>

      <main className="relative mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center gap-8 px-6 py-24 text-center sm:px-8">
        {/* Quiet orb */}
        <div className="relative flex h-24 w-24 items-center justify-center">
          <span
            className="absolute inset-0 rounded-full opacity-30"
            style={{
              background: "radial-gradient(closest-side, rgba(194,120,74,0.5), rgba(194,120,74,0.1) 60%, transparent)",
              animation: "waveBreath 3s ease-in-out infinite",
            }}
          />
          <span
            className="h-10 w-10 rounded-full"
            style={{
              background: "radial-gradient(closest-side, rgba(214,154,110,0.9), rgba(194,120,74,0.6) 50%, rgba(194,120,74,0.15))",
            }}
          />
        </div>

        <div className="flex flex-col gap-3">
          <p className="text-[11px] tracking-[0.22em] text-[var(--color-bone-dim)] uppercase">
            404
          </p>
          <h1 className="font-serif text-[38px] leading-[1.08] tracking-[-0.02em] text-balance text-[var(--color-bone)] sm:text-[44px]">
            Nothing here.
          </h1>
          <p className="text-[15px] leading-[1.7] text-[var(--color-bone)]/70">
            The page you were after doesn&apos;t exist, or it has gone quiet.
          </p>
        </div>

        <Link href="/" className={buttonClasses({ variant: "outline", size: "md" })}>
          Back to start
        </Link>
      </main>
    </div>
  );
}
