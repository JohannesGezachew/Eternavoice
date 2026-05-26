"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Mark } from "@/components/shell/Mark";
import { useSession } from "@/lib/session";

export function ConversationList() {
  const router = useRouter();
  const conversations = useSession((s) => s.conversations);
  const currentConversationId = useSession((s) => s.currentConversationId);
  const openConversation = useSession((s) => s.openConversation);
  const deleteConversation = useSession((s) => s.deleteConversation);
  const newConversation = useSession((s) => s.newConversation);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-6 py-6 sm:px-8">
      <header className="flex items-center justify-between">
        <Link href="/" aria-label="Home" className="-mx-1 px-1">
          <Mark />
        </Link>
        <Link
          href="/conversation"
          className="text-[12px] text-[var(--color-bone-dim)] transition hover:text-[var(--color-bone)]"
        >
          Current chat
        </Link>
      </header>

      <main className="py-12">
        <div className="max-w-2xl space-y-3">
          <p className="text-[12px] tracking-[0.22em] text-[var(--color-bone-dim)] uppercase">
            Conversations
          </p>
          <h1 className="font-serif text-[38px] leading-[1.08] text-[var(--color-bone)] sm:text-[54px]">
            Pick up where you left off.
          </h1>
          <p className="text-[15px] leading-[1.7] text-[var(--color-bone)]/68">
            These conversations are saved on this device. Account-backed sync is
            still required before they can follow a user across devices.
          </p>
        </div>

        <div className="mt-10 grid gap-3">
          {conversations.length ? (
            conversations.map((conversation) => (
              <section
                key={conversation.id}
                className="hairline flex flex-col gap-4 rounded-2xl bg-white/[0.018] p-5 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <h2 className="truncate font-serif text-[24px] text-[var(--color-bone)]">
                    {conversation.title}
                  </h2>
                  <p className="mt-1 text-[12px] text-[var(--color-bone-dim)]">
                    {conversation.voiceName} · {conversation.turns.length} turns · Updated{" "}
                    {new Date(conversation.updatedAt).toLocaleDateString()}
                    {conversation.id === currentConversationId ? " · Current" : ""}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="primary"
                    size="md"
                    onClick={() => {
                      openConversation(conversation.id);
                      router.push("/conversation");
                    }}
                  >
                    Open
                  </Button>
                  <Button
                    variant="ghost"
                    size="md"
                    onClick={() => deleteConversation(conversation.id)}
                  >
                    Delete
                  </Button>
                </div>
              </section>
            ))
          ) : (
            <div className="hairline rounded-2xl bg-white/[0.018] p-7">
              <p className="text-[15px] text-[var(--color-bone)]/75">
                No saved conversations on this device yet.
              </p>
              <div className="mt-5">
                <Button
                  variant="primary"
                  size="md"
                  onClick={() => {
                    newConversation();
                    router.push("/conversation");
                  }}
                >
                  Start a conversation
                </Button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
