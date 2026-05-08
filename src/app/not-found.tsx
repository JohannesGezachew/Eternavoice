import Link from "next/link";
import { Nav } from "@/components/shell/Nav";
import { buttonClasses } from "@/components/ui/buttonClasses";

export default function NotFound() {
  return (
    <>
      <Nav />
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-start justify-center gap-6 px-6 py-24 sm:px-8">
        <p className="text-[12px] tracking-[0.22em] text-[var(--color-bone-dim)] uppercase">
          404
        </p>
        <h1 className="font-serif text-[44px] leading-[1.06] tracking-[-0.02em] text-balance text-[var(--color-bone)]">
          Nothing here.
        </h1>
        <p className="text-[15px] leading-[1.7] text-[var(--color-bone)]/70">
          The page you were after doesn’t exist, or it has gone quiet.
        </p>
        <Link href="/" className={buttonClasses({ variant: "outline", size: "md" })}>
          Back to start
        </Link>
      </main>
    </>
  );
}
