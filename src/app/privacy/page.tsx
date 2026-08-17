import Link from "next/link";
import { Mark } from "@/components/shell/Mark";

export const metadata = {
  title: "Privacy Policy",
  description: "How EternaVoice handles voice recordings, recreated voices, and conversation data.",
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated="May 26, 2026" sibling={{ href: "/terms", label: "Terms" }}>
      <p>
        EternaVoice handles voice recordings, recreated voices, persona details,
        and conversation text. This page explains what we collect, how it is
        protected, and how you can delete it.
      </p>
      <h2>What We Collect</h2>
      <p>
        When you use the app, you may provide audio or video recordings, a voice
        name, persona information, typed messages, and microphone recordings for
        transcription.
      </p>
      <h2>How It Is Used</h2>
      <p>
        Recordings are processed by EternaVoice services to recreate and play
        their voices. Messages and voice input may be sent to OpenAI to generate
        and transcribe conversation turns.
      </p>
      <h2>How It Is Stored</h2>
      <p>
        Your conversations, memories, and persona settings are stored in our
        database against your account. Conversation text, memories, and session
        summaries are encrypted at rest with AES-256 using a key derived
        specifically for your account, so they cannot be read from the database
        alone. Your browser also keeps a local copy of some of this so the app
        works quickly; clearing browser data removes only that local copy.
      </p>
      <h2>Third-Party Processing</h2>
      <p>
        EternaVoice relies on external AI providers for voice recreation,
        text-to-speech, transcription, and response generation. Those providers
        process submitted content to return the requested feature.
      </p>
      <h2>Your Choices</h2>
      <p>
        You can export everything held against your account, and you can delete
        it. Deleting your account permanently removes your conversations,
        memories, session summaries, persona settings, and profile from our
        database, deletes the recreated voices from our voice provider, and
        cancels any active subscription. It cannot be undone. Both are
        available from the Account page.
      </p>
      <h2>Contact</h2>
      <p>
        For privacy requests, email{" "}
        <a href="mailto:dev@eternavoice.com" className="underline underline-offset-4">
          dev@eternavoice.com
        </a>
        .
      </p>
    </LegalPage>
  );
}

function LegalPage({
  title,
  updated,
  sibling,
  children,
}: {
  title: string;
  updated: string;
  sibling: { href: string; label: string };
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh w-full flex-col bg-[var(--color-ink)] text-[var(--color-bone)]"><div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-6 sm:px-8">
      <header className="flex items-center justify-between">
        <Link href="/" aria-label="Home" className="-mx-1 px-1">
          <Mark />
        </Link>
        <Link
          href={sibling.href}
          className="text-small text-[var(--color-bone-dim)] transition hover:text-[var(--color-bone)]"
        >
          {sibling.label}
        </Link>
      </header>
      <main className="py-14">
        <p className="text-small tracking-[0.22em] text-[var(--color-bone-dim)] uppercase">
          Last updated {updated}
        </p>
        <h1 className="font-serif mt-4 text-display leading-[1.08] tracking-[-0.02em] text-balance text-[var(--color-bone)] sm:text-[54px]">
          {title}
        </h1>
        <div className="mt-10 space-y-8 border-t border-[var(--color-rule)] pt-10 text-body leading-[1.85] text-[var(--color-bone)]/65 [&_h2]:mb-3 [&_h2]:mt-8 [&_h2]:font-serif [&_h2]:text-title [&_h2]:leading-[1.2] [&_h2]:tracking-[-0.01em] [&_h2]:text-[var(--color-bone)] [&_p]:mt-0">
          {children}
        </div>
      </main>
    </div>
    </div>
  );
}
