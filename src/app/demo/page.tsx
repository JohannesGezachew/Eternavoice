import Link from "next/link";
import { Nav } from "@/components/shell/Nav";
import { ConversationDemo } from "@/components/landing/ConversationDemo";
import { buttonClasses } from "@/components/ui/buttonClasses";

export const metadata = {
  title: "See how it works",
  description: "What a conversation on EternaVoice looks like, before you begin.",
};

// The wizard's first step asks someone to name their dead — a heavy ante.
// This page lets them feel the product before climbing that hill.
export default function DemoPage() {
  return (
    <div className="flex min-h-dvh w-full flex-col bg-[var(--color-ink)] text-[var(--color-bone)]">
      <Nav />
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center px-6 py-14 text-center sm:px-8 sm:py-20">
        <p className="eyebrow-center">Before you begin</p>
        <h1 className="font-serif mt-5 text-[32px] leading-[1.08] tracking-[-0.02em] text-balance sm:text-[44px]">
          This is what a conversation looks like.
        </h1>
        <p className="mt-4 max-w-md text-[15px] leading-[1.7] text-[var(--color-text-secondary)]">
          A real exchange, the way it unfolds in the app. Your person speaks
          first, in their own voice — you answer by speaking or typing.
        </p>

        <div className="mt-10 w-full text-left">
          <ConversationDemo />
        </div>

        <div className="mt-10 flex flex-col items-center gap-4">
          <Link href="/people/new" className={buttonClasses({ variant: "primary", size: "lg" })}>
            Start with a voicemail
          </Link>
          <p className="max-w-xs text-[12px] leading-[1.7] text-[var(--color-text-tertiary)]">
            Ninety seconds of any recording is enough. You&rsquo;ll hear the
            voice and approve it before any conversation begins.
          </p>
        </div>
      </main>
    </div>
  );
}
