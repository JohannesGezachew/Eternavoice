"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatRelativeDay, cn } from "@/lib/utils";
import {
  groupConversations,
  searchConversations,
  matchingSnippet,
  lastSpokenLine,
  formatTimeOfDay,
} from "@/lib/conversations";
import type { ConversationRecord } from "@/lib/types";

export interface ConversationListProps {
  conversations: ConversationRecord[];
  /** Highlighted as the one in progress. */
  currentConversationId?: string | null;
  /** Continue the conversation — drops into the live room. */
  onOpen: (conversation: ConversationRecord) => void;
  /** Read it back without going live. Omit to hide the affordance. */
  onRead?: (conversation: ConversationRecord) => void;
  onPin: (conversation: ConversationRecord) => void;
  onRename: (conversation: ConversationRecord, title: string) => void;
  onDelete: (conversation: ConversationRecord) => void;
  /** Speak the last reply. Omit where there's no audio pipeline. */
  onPlay?: (conversation: ConversationRecord) => void;
  playingId?: string | null;
  /** Whose conversation it is — shown only where several people are mixed. */
  personNameFor?: (conversation: ConversationRecord) => string | null;
  /** Hidden on short lists, where scanning is faster than typing. */
  showSearch?: boolean;
  emptyTitle?: string;
  emptyBody?: string;
  /** Denser rows for the in-conversation sheet. */
  compact?: boolean;
}

const SEARCH_THRESHOLD = 5;

export function ConversationList({
  conversations,
  currentConversationId,
  onOpen,
  onRead,
  onPin,
  onRename,
  onDelete,
  onPlay,
  playingId,
  personNameFor,
  showSearch = true,
  emptyTitle = "No conversations yet",
  emptyBody = "They'll appear here after your first exchange — every word saved, ready to pick back up.",
  compact = false,
}: ConversationListProps) {
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [menuId, setMenuId] = useState<string | null>(null);

  // Close the overflow menu on any outside click or Escape.
  useEffect(() => {
    if (!menuId) return;
    const close = () => setMenuId(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuId(null);
    };
    window.addEventListener("click", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [menuId]);

  const filtered = useMemo(
    () => searchConversations(conversations, query),
    [conversations, query],
  );
  const groups = useMemo(() => groupConversations(filtered), [filtered]);

  const searchable = showSearch && conversations.length >= SEARCH_THRESHOLD;

  const saveRename = (conversation: ConversationRecord) => {
    const clean = draftTitle.replace(/\s+/g, " ").trim();
    if (clean && clean !== conversation.title) onRename(conversation, clean);
    setEditingId(null);
    setDraftTitle("");
  };

  return (
    <div className="flex flex-col gap-3">
      {searchable ? (
        <SearchField value={query} onChange={setQuery} />
      ) : null}

      {!conversations.length ? (
        <EmptyState compact variant="conversations" title={emptyTitle} body={emptyBody} />
      ) : !filtered.length ? (
        <p className="px-1 py-6 text-center text-[13px] leading-[1.6] text-[var(--color-text-secondary)]">
          Nothing matches “{query.trim()}”.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {groups.map(({ bucket, conversations: rows }) => (
            <section key={bucket} className="flex flex-col gap-1.5">
              <h3 className="px-1 text-[11px] tracking-[0.14em] text-[var(--color-text-tertiary)] uppercase">
                {bucket}
              </h3>
              <div className="flex flex-col gap-1">
                {rows.map((conversation) => {
                  const editing = editingId === conversation.id;
                  const current = conversation.id === currentConversationId;
                  const snippet =
                    matchingSnippet(conversation, query) ?? lastSpokenLine(conversation);
                  const person = personNameFor?.(conversation) ?? null;

                  if (editing) {
                    return (
                      <div
                        key={conversation.id}
                        className="flex items-center gap-2 rounded-xl border border-[var(--color-ember)]/30 bg-white/[0.02] p-2"
                      >
                        <input
                          value={draftTitle}
                          onChange={(e) => setDraftTitle(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") saveRename(conversation);
                            if (e.key === "Escape") setEditingId(null);
                          }}
                          autoFocus
                          maxLength={90}
                          aria-label="Rename conversation"
                          className="min-w-0 flex-1 bg-transparent px-2 py-2 text-[14px] text-[var(--color-bone)] outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => saveRename(conversation)}
                          className="flex h-11 shrink-0 cursor-pointer items-center rounded-lg px-3 text-[13px] text-[var(--color-ember)] transition hover:bg-white/[0.04]"
                        >
                          Save
                        </button>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={conversation.id}
                      className={cn(
                        "group relative flex items-center rounded-xl pr-1 transition-colors",
                        current ? "bg-white/[0.045]" : "hover:bg-white/[0.025]",
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => onOpen(conversation)}
                        className={cn(
                          "flex min-w-0 flex-1 cursor-pointer flex-col justify-center gap-1 pr-1 pl-3 text-left",
                          compact ? "min-h-[60px] py-2.5" : "min-h-[68px] py-3",
                        )}
                      >
                        <span className="flex items-center gap-1.5">
                          {conversation.pinned ? (
                            <PinGlyph filled className="shrink-0 text-[var(--color-ember)]" />
                          ) : null}
                          <span
                            className={cn(
                              "truncate font-serif leading-snug text-[var(--color-bone)]",
                              compact ? "text-[16px]" : "text-[17px]",
                            )}
                          >
                            {conversation.title}
                          </span>
                        </span>
                        {snippet ? (
                          <span className="truncate text-[12px] leading-[1.5] text-[var(--color-bone-dim)]/70">
                            {snippet}
                          </span>
                        ) : null}
                        <span className="text-[11px] text-[var(--color-text-tertiary)]">
                          {person ? `${person} · ` : ""}
                          {formatRelativeDay(conversation.updatedAt)} ·{" "}
                          {formatTimeOfDay(conversation.updatedAt)}
                          {current ? (
                            <span className="text-[var(--color-verdigris)]"> · in progress</span>
                          ) : null}
                        </span>
                      </button>

                      {onRead ? (
                        <button
                          type="button"
                          onClick={() => onRead(conversation)}
                          aria-label={`Read “${conversation.title}” without starting a new conversation`}
                          title="Read it back"
                          className="flex h-11 w-10 shrink-0 cursor-pointer items-center justify-center rounded-lg text-[var(--color-bone-dim)]/70 transition hover:text-[var(--color-bone)]"
                        >
                          <ReadGlyph />
                        </button>
                      ) : null}

                      {onPlay &&
                      conversation.turns.some((t) => t.role === "assistant" && t.content.trim()) ? (
                        <button
                          type="button"
                          onClick={() => onPlay(conversation)}
                          disabled={playingId === conversation.id}
                          aria-label="Play their last reply in this conversation"
                          className="flex h-11 w-10 shrink-0 cursor-pointer items-center justify-center rounded-lg text-[var(--color-bone-dim)]/70 transition hover:text-[var(--color-ember)] disabled:cursor-default"
                        >
                          {playingId === conversation.id ? (
                            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[var(--color-ember)]/30 border-t-[var(--color-ember)]" />
                          ) : (
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                              <path d="M8 5v14l11-7z" />
                            </svg>
                          )}
                        </button>
                      ) : null}

                      {/* Pin, rename and delete live behind one control. Delete
                          used to sit beside Rename as an identical text button,
                          one mis-tap away. */}
                      <div className="relative shrink-0">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setMenuId((open) => (open === conversation.id ? null : conversation.id));
                          }}
                          aria-label={`More actions for “${conversation.title}”`}
                          aria-expanded={menuId === conversation.id}
                          aria-haspopup="menu"
                          className="flex h-11 w-10 cursor-pointer items-center justify-center rounded-lg text-[var(--color-bone-dim)]/70 transition hover:text-[var(--color-bone)]"
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                            <circle cx="12" cy="5" r="1.6" />
                            <circle cx="12" cy="12" r="1.6" />
                            <circle cx="12" cy="19" r="1.6" />
                          </svg>
                        </button>

                        <AnimatePresence>
                          {menuId === conversation.id ? (
                            <motion.div
                              initial={{ opacity: 0, y: -4 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0 }}
                              transition={{ duration: 0.14 }}
                              role="menu"
                              onClick={(e) => e.stopPropagation()}
                              className="hairline-strong absolute right-0 top-11 z-30 w-44 overflow-hidden rounded-xl bg-[var(--color-ink-2)]/97 py-1 shadow-2xl backdrop-blur-xl"
                            >
                              <MenuItem
                                onClick={() => {
                                  onPin(conversation);
                                  setMenuId(null);
                                }}
                              >
                                {conversation.pinned ? "Unpin" : "Pin to top"}
                              </MenuItem>
                              <MenuItem
                                onClick={() => {
                                  setEditingId(conversation.id);
                                  setDraftTitle(conversation.title);
                                  setMenuId(null);
                                }}
                              >
                                Rename
                              </MenuItem>
                              <MenuItem
                                destructive
                                onClick={() => {
                                  onDelete(conversation);
                                  setMenuId(null);
                                }}
                              >
                                Delete
                              </MenuItem>
                            </motion.div>
                          ) : null}
                        </AnimatePresence>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function MenuItem({
  children,
  onClick,
  destructive,
}: {
  children: React.ReactNode;
  onClick: () => void;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={cn(
        "flex min-h-[42px] w-full cursor-pointer items-center px-3.5 text-left text-[13px] transition-colors",
        destructive
          ? "text-[var(--color-bone-dim)] hover:bg-[var(--color-danger)]/10 hover:text-[var(--color-danger)]"
          : "text-[var(--color-bone)]/85 hover:bg-white/[0.04]",
      )}
    >
      {children}
    </button>
  );
}

function SearchField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const ref = useRef<HTMLInputElement | null>(null);
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--color-bone-dim)]/50">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
      </span>
      <input
        ref={ref}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search what was said"
        aria-label="Search conversations"
        className="hairline h-11 w-full rounded-xl bg-white/[0.02] pr-10 pl-10 text-[14px] text-[var(--color-bone)] transition placeholder:text-[var(--color-bone-dim)]/45 focus:border-[var(--color-ember)]/35 focus:outline-none"
      />
      {value ? (
        <button
          type="button"
          onClick={() => {
            onChange("");
            ref.current?.focus();
          }}
          aria-label="Clear search"
          className="absolute right-1 top-1/2 flex h-11 w-9 -translate-y-1/2 cursor-pointer items-center justify-center rounded-lg text-[var(--color-bone-dim)]/70 transition hover:text-[var(--color-bone)]"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      ) : null}
    </div>
  );
}

export function PinGlyph({ filled, className }: { filled?: boolean; className?: string }) {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M12 17v5M9 4h6l1 7 2.5 2.5H5.5L8 11l1-7z" />
    </svg>
  );
}

function ReadGlyph() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H10a2 2 0 0 1 2 2v13a1.5 1.5 0 0 0-1.5-1.5H5.5A1.5 1.5 0 0 1 4 16z" />
      <path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H14a2 2 0 0 0-2 2v13a1.5 1.5 0 0 1 1.5-1.5h5A1.5 1.5 0 0 0 20 16z" />
    </svg>
  );
}
