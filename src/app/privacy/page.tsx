import Link from "next/link";
import { Mark } from "@/components/shell/Mark";

export const metadata = {
  title: "Privacy Policy",
  description: "How EternaVoice handles voice recordings, cloned voices, and conversation data.",
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated="May 26, 2026">
      <p>
        EternaVoice handles voice recordings, cloned voices, persona details,
        and conversation text. This page explains the current product behavior
        and should be reviewed by counsel before commercial launch.
      </p>
      <h2>What We Collect</h2>
      <p>
        When you use the app, you may provide audio or video recordings, a voice
        name, persona information, typed messages, and microphone recordings for
        transcription.
      </p>
      <h2>How It Is Used</h2>
      <p>
        Recordings are processed by EternaVoice services to create and play
        cloned voices.
        Messages and voice input may be sent to OpenAI to generate and
        transcribe conversation turns.
      </p>
      <h2>Current Storage</h2>
      <p>
        In this build, voice IDs, persona settings, the local voice list, and
        conversation history are stored in this browser&apos;s local storage.
        Clearing browser data removes that local copy. Server-side account
        storage has not been added yet.
      </p>
      <h2>Third-Party Processing</h2>
      <p>
        EternaVoice relies on external AI providers for voice cloning,
        text-to-speech, transcription, and response generation. Those providers
        process submitted content to return the requested feature.
      </p>
      <h2>Your Choices</h2>
      <p>
        You can clear local browser storage, forget local voice entries from the
        voice library, or stop using the app. Provider-side deletion and account
        data export require a server account system and operational process.
      </p>
      <h2>Contact</h2>
      <p>
        For privacy requests, publish a dedicated support address before opening
        the product to real users.
      </p>
    </LegalPage>
  );
}

function LegalPage({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-6 sm:px-8">
      <header className="flex items-center justify-between">
        <Link href="/" aria-label="Home" className="-mx-1 px-1">
          <Mark />
        </Link>
        <Link href="/terms" className="text-[12px] text-[var(--color-bone-dim)] transition hover:text-[var(--color-bone)]">
          Terms
        </Link>
      </header>
      <main className="prose prose-invert py-12">
        <p className="text-[12px] tracking-[0.22em] text-[var(--color-bone-dim)] uppercase">
          Last updated {updated}
        </p>
        <h1 className="font-serif text-[42px] leading-[1.08] text-[var(--color-bone)]">
          {title}
        </h1>
        <div className="mt-8 space-y-7 text-[15px] leading-[1.8] text-[var(--color-bone)]/72 [&_h2]:font-serif [&_h2]:text-[24px] [&_h2]:text-[var(--color-bone)]">
          {children}
        </div>
      </main>
    </div>
  );
}
