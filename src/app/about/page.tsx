import Link from "next/link";
import { Nav } from "@/components/shell/Nav";
import { buttonClasses } from "@/components/ui/buttonClasses";

export const metadata = {
  title: "Why we built this",
  description:
    "Who is behind EternaVoice, why it exists, and the lines we won't cross.",
};

// The trust page: a grief product made by people with names, with a stated
// ethical position. Linked from the consent step and the footer.
export default function AboutPage() {
  return (
    <div className="flex min-h-dvh w-full flex-col bg-[var(--color-ink)] text-[var(--color-bone)]">
      <Nav />
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-6 py-16 sm:px-8 sm:py-24">
        <p className="eyebrow">Why we built this</p>
        <h1 className="font-serif mt-5 text-[34px] leading-[1.08] tracking-[-0.02em] text-balance sm:text-[48px]">
          A voice is the part of a person you forget first.
        </h1>

        <div className="mt-10 space-y-7 border-t border-[var(--color-rule)] pt-10 text-[16px] leading-[1.85] text-[var(--color-bone)]/80">
          <p>
            Photographs keep faces. Letters keep words. But the sound of
            someone — how they said your name, the pause before they laughed —
            fades within a few years of losing them. Most people discover this
            too late, reaching for a voice they can no longer quite hear.
          </p>
          <p>
            EternaVoice exists so that doesn&rsquo;t have to happen. From a
            voicemail, a video, a voice note — the recordings you already have
            — it preserves how they sounded, and lets you keep talking.
          </p>

          <h2 className="font-serif pt-4 text-[24px] leading-tight text-[var(--color-bone)]">
            What we will not do
          </h2>
          <ul className="list-none space-y-4 pl-0">
            {[
              "Your recordings and the voice made from them are never shared, never used to train anything, and never heard by anyone but you.",
              "We don't pretend. Every voice here is introduced as what it is: an AI voice built from recordings of someone you love.",
              "We won't make leaving hard. Delete everything — voices, conversations, your account — in one place, in seconds, permanently.",
              "We ask you to confirm you have the right to use a voice before you clone it, every time. Grief deserves consent, on both sides.",
            ].map((line) => (
              <li key={line} className="flex gap-3">
                <span className="mt-[11px] h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-ember)]" aria-hidden />
                <span>{line}</span>
              </li>
            ))}
          </ul>

          <h2 className="font-serif pt-4 text-[24px] leading-tight text-[var(--color-bone)]">
            Alongside grief, not instead of it
          </h2>
          <p>
            This is a way to keep a voice you don&rsquo;t want to forget — not
            a replacement for the person, and not a substitute for support. If
            grief is heavy right now, please also talk to someone living:
            a friend, a counsellor, or an organisation like{" "}
            <a
              href="https://www.cruse.org.uk"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-4 transition hover:text-[var(--color-bone)]"
            >
              Cruse Bereavement Support
            </a>
            . EternaVoice works best beside that, never in place of it.
          </p>

          <p className="border-t border-[var(--color-rule)] pt-7 text-[14px] leading-[1.8] text-[var(--color-text-secondary)]">
            EternaVoice is built by a small team that has lost people too.
            Questions, doubts, or something we should hear?{" "}
            <a href="mailto:support@eternavoice.app" className="underline underline-offset-4">
              support@eternavoice.app
            </a>{" "}
            reaches a person, not a queue.
          </p>
        </div>

        <div className="mt-12">
          <Link href="/auth/login" className={buttonClasses({ variant: "primary", size: "lg" })}>
            Start with a voicemail
          </Link>
        </div>
      </main>
    </div>
  );
}
