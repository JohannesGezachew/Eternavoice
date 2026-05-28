"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { Mark } from "@/components/shell/Mark";
import { useSession } from "@/lib/session";
import { fadeUp, stagger } from "@/lib/motion";

export function VoiceLibrary() {
  const router = useRouter();
  const voices = useSession((s) => s.voices);
  const activeVoiceId = useSession((s) => s.voiceId);
  const setActiveVoice = useSession((s) => s.setActiveVoice);
  const renameVoice = useSession((s) => s.renameVoice);
  const forgetVoice = useSession((s) => s.forgetVoice);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const startRename = (id: string, name: string) => {
    setEditingId(id);
    setDraftName(name);
  };

  const saveRename = () => {
    if (!editingId) return;
    const nextName = draftName.trim();
    if (!nextName) return;
    renameVoice(editingId, nextName);
    setEditingId(null);
    setDraftName("");
  };

  const deleteProviderVoice = async (id: string, name: string) => {
    const confirmed = window.confirm(
      `Delete "${name}" from hosted voice storage and remove it from this device? This cannot be undone.`,
    );
    if (!confirmed) return;

    setDeletingId(id);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/voices/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(json?.error || "Could not delete that hosted voice.");
      }
      forgetVoice(id);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Could not delete that hosted voice.");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-6 py-6 sm:px-8">
      <header className="flex items-center justify-between">
        <Link href="/" aria-label="Home" className="-mx-1 px-1">
          <Mark />
        </Link>
        <Link
          href="/record"
          className="text-[12px] text-[var(--color-bone-dim)] transition hover:text-[var(--color-bone)]"
        >
          New voice
        </Link>
      </header>

      <main className="py-12">
        <motion.div
          initial={false}
          animate="enter"
          variants={stagger(0.06)}
          className="max-w-2xl"
        >
          <motion.p variants={fadeUp} className="text-[12px] tracking-[0.22em] text-[var(--color-bone-dim)] uppercase">
            Voice library
          </motion.p>
          <motion.h1 variants={fadeUp} className="font-serif mt-3 text-[38px] leading-[1.08] text-[var(--color-bone)] sm:text-[54px]">
            Choose who speaks.
          </motion.h1>
          <motion.p variants={fadeUp} className="mt-3 text-[15px] leading-[1.7] text-[var(--color-bone)]/65">
            Your saved voices. Activate one to begin a conversation, or add a new
            voice from a recording.
          </motion.p>
          {deleteError ? (
            <motion.p variants={fadeUp} className="mt-3 text-[13px] text-[var(--color-ember-soft)]">
              {deleteError}
            </motion.p>
          ) : null}
        </motion.div>

        <motion.div
          initial={false}
          animate="enter"
          variants={stagger(0.07)}
          className="mt-10 grid gap-3"
        >
          {voices.length ? (
            voices.map((voice) => {
              const active = voice.id === activeVoiceId;
              const editing = editingId === voice.id;
              return (
                <motion.section
                  key={voice.id}
                  variants={fadeUp}
                  className="group hairline flex flex-col gap-4 rounded-2xl bg-white/[0.018] p-5 transition-colors duration-300 hover:bg-white/[0.028] sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 flex-1">
                    {editing ? (
                      <div className="flex max-w-md gap-2">
                        <Input
                          value={draftName}
                          onChange={(e) => setDraftName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") saveRename();
                            if (e.key === "Escape") setEditingId(null);
                          }}
                          autoFocus
                          maxLength={80}
                        />
                        <Button variant="outline" size="md" onClick={saveRename}>
                          Save
                        </Button>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-2.5">
                          {active ? (
                            <span className="inline-flex h-1.5 w-1.5 rounded-full bg-[var(--color-ember)]" aria-hidden />
                          ) : null}
                          <h2 className="font-serif text-[24px] text-[var(--color-bone)]">
                            {voice.name}
                          </h2>
                        </div>
                        <p className="mt-1 text-[12px] text-[var(--color-bone-dim)]">
                          Created {new Date(voice.createdAt).toLocaleDateString()}
                          {active ? " · Active" : ""}
                        </p>
                      </>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant={active ? "ghost" : "primary"}
                      size="md"
                      disabled={active}
                      onClick={() => {
                        setActiveVoice(voice.id);
                        router.push("/conversation");
                      }}
                    >
                      {active ? "Active" : "Speak"}
                    </Button>
                    <Button variant="outline" size="md" onClick={() => startRename(voice.id, voice.name)}>
                      Rename
                    </Button>
                    <Button variant="ghost" size="md" onClick={() => forgetVoice(voice.id)}>
                      Forget locally
                    </Button>
                    <Button
                      variant="ghost"
                      size="md"
                      loading={deletingId === voice.id}
                      disabled={deletingId === voice.id}
                      onClick={() => void deleteProviderVoice(voice.id, voice.name)}
                    >
                      Delete
                    </Button>
                  </div>
                </motion.section>
              );
            })
          ) : (
            <motion.div variants={fadeUp} className="hairline rounded-2xl bg-white/[0.018] p-10 text-center">
              <div className="mx-auto mb-5 flex h-10 w-10 items-center justify-center rounded-full border border-[var(--color-rule-strong)] bg-[var(--color-ember)]/[0.06]">
                <span className="inline-block h-2 w-2 rounded-full bg-[var(--color-ember)]/70" />
              </div>
              <p className="text-[15px] text-[var(--color-bone)]/75">
                No saved voices yet.
              </p>
              <p className="mt-2 text-[13px] leading-[1.6] text-[var(--color-bone-dim)]">
                Upload a recording or use your microphone to make the first one.
              </p>
              <div className="mt-6">
                <Button variant="primary" size="md" onClick={() => router.push("/record")}>
                  Make a voice
                </Button>
              </div>
            </motion.div>
          )}
        </motion.div>
      </main>
    </div>
  );
}
