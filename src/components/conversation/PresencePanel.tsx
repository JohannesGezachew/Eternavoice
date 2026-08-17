"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { PersonAvatar } from "@/components/people/PersonAvatar";
import { cn } from "@/lib/utils";

/**
 * Who you're with, on desktop.
 *
 * The talk room is a single orb centred in a very large empty canvas — on a
 * 1440px screen almost everything is void. This fills the left of it with the
 * one thing that belongs there: the person. Their face, their name, and what
 * they're carrying into this conversation.
 *
 * It also answers a question the app never answered anywhere — which memories
 * are actually in play. Twenty-four reach the prompt; someone with eighty has
 * no way to know that, and "they remember" is the whole promise.
 *
 * Hidden below lg and in ambient mode, where the room is meant to fall away.
 */
export function PresencePanel({
  name,
  subtitle,
  avatarId,
  avatarSeed,
  memoriesInPlay,
  memoriesTotal,
  memoriesHref,
  speaking,
  hidden,
}: {
  name: string;
  subtitle: string;
  avatarId: string | null;
  avatarSeed: string;
  /** How many memories reached this conversation's prompt. */
  memoriesInPlay: number;
  /** How many exist for this person in total. */
  memoriesTotal: number;
  memoriesHref: string;
  speaking: boolean;
  hidden: boolean;
}) {
  return (
    <motion.aside
      aria-label={`Speaking with ${name}`}
      initial={false}
      animate={{ opacity: hidden ? 0 : 1 }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      className={cn(
        "pointer-events-none fixed left-8 top-1/2 z-20 hidden w-56 -translate-y-1/2 flex-col gap-4 lg:flex",
        hidden && "invisible",
      )}
    >
      <div className="pointer-events-auto flex flex-col gap-3">
        <div className="relative w-max">
          <PersonAvatar
            id={avatarId}
            seed={avatarSeed}
            size={56}
            initial={name.trim().charAt(0).toUpperCase() || "·"}
          />
          {/* A quiet ring while they speak — the panel breathes with the room
              rather than sitting inert beside it. */}
          <motion.span
            aria-hidden
            className="absolute inset-[-6px] rounded-full border border-[var(--color-ember)]/40"
            animate={
              speaking
                ? { opacity: [0.15, 0.6, 0.15], scale: [1, 1.06, 1] }
                : { opacity: 0, scale: 1 }
            }
            transition={{ duration: 2.8, repeat: speaking ? Infinity : 0, ease: "easeInOut" }}
          />
        </div>

        <div className="flex flex-col gap-0.5">
          <span className="font-serif text-lead leading-tight text-[var(--color-bone)]">
            {name}
          </span>
          <span className="text-micro text-[var(--color-text-tertiary)]">{subtitle}</span>
        </div>
      </div>

      {memoriesTotal > 0 ? (
        <Link
          href={memoriesHref}
          className="pointer-events-auto flex flex-col gap-1 border-t border-[var(--color-rule)] pt-3 text-micro text-[var(--color-text-tertiary)] transition-colors hover:text-[var(--color-bone-dim)]"
        >
          <span>
            Carrying {memoriesInPlay} {memoriesInPlay === 1 ? "memory" : "memories"}
          </span>
          {/* Naming the ceiling out loud. Silently dropping the rest would be
              the same broken promise as the conversation cap was. */}
          {memoriesTotal > memoriesInPlay ? (
            <span className="text-[var(--color-text-tertiary)]/80">
              of {memoriesTotal} — the most recent reach them
            </span>
          ) : null}
        </Link>
      ) : null}
    </motion.aside>
  );
}
