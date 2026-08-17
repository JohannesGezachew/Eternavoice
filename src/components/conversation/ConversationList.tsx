"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatRelativeDay, cn } from "@/lib/utils";
import {
  groupConversations,
  searchConversations,
  sortConversations,
  matchingSnippet,
  lastSpokenLine,
  formatTimeOfDay,
  type ConversationSort,
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
  /** Offer oldest-first and a total. Off in the in-conversation sheet, where
   *  the list is a quick switcher rather than an archive. */
  showControls?: boolean;
  /** Save a conversation as readable text. Omit to hide the action. */
  onExport?: (conversation: ConversationRecord) => void;
  emptyTitle?: string;
  emptyBody?: string;
  /** Denser rows for the in-conversation sheet. */
  compact?: boolean;
  /**
   * Select several at once, to delete or export them together.
   *
   * Only offered where the list is an archive. Clearing out a year of
   * conversations one confirmation dialog at a time is not a thing anyone will
   * do, so in practice the choice was keep everything or keep nothing.
   */
  onDeleteMany?: (conversations: ConversationRecord[]) => void;
  onExportMany?: (conversations: ConversationRecord[]) => void;
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
  showControls = false,
  onExport,
  emptyTitle = "No conversations yet",
  emptyBody = "They'll appear here after your first exchange — every word saved, ready to pick back up.",
  compact = false,
  onDeleteMany,
  onExportMany,
}: ConversationListProps) {
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [menuId, setMenuId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [selecting, setSelecting] = useState(false);

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

  const [order, setOrder] = useState<ConversationSort>("recent");

  const filtered = useMemo(
    () => searchConversations(conversations, query),
    [conversations, query],
  );
  // Oldest-first is a different act from browsing: reading a relationship
  // forwards. Time grouping is meaningless there, so it renders as one list.
  const ordered = useMemo(() => sortConversations(filtered, order), [filtered, order]);
  const groups = useMemo(
    () =>
      order === "oldest"
        ? [{ bucket: "From the beginning" as const, conversations: ordered }]
        : groupConversations(ordered),
    [ordered, order],
  );

  const searchable = showSearch && conversations.length >= SEARCH_THRESHOLD;

  const bulk = Boolean(onDeleteMany || onExportMany) && conversations.length > 1;
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const endSelecting = () => {
    setSelecting(false);
    setSelected(new Set());
  };
  // Only what is on screen: selecting inside a search and then clearing it
  // must not quietly widen what "all" meant.
  const chosen = ordered.filter((c) => selected.has(c.id));

  const saveRename = (conversation: ConversationRecord) => {
    const clean = draftTitle.replace(/\s+/g, " ").trim();
    if (clean && clean !== conversation.title) onRename(conversation, clean);
    setEditingId(null);
    setDraftTitle("");
  };

  return (
    <div className="flex flex-col gap-3">
      {searchable ? <SearchField value={query} onChange={setQuery} /> : null}

      {/* How many there are, and which way round. The count was missing
          entirely — an archive that never says how much it holds. */}
      {showControls && conversations.length > 0 ? (
        <div className="flex items-center justify-between px-1 text-micro text-[var(--color-text-tertiary)]">
          <span>
            {query.trim()
              ? `${filtered.length} of ${conversations.length}`
              : `${conversations.length} ${conversations.length === 1 ? "conversation" : "conversations"}`}
          </span>
          <span className="flex items-center gap-4">
            {bulk ? (
              <button
                type="button"
                onClick={() => (selecting ? endSelecting() : setSelecting(true))}
                className="flex h-11 cursor-pointer items-center text-[var(--color-bone-dim)] underline underline-offset-4 transition hover:text-[var(--color-bone)]"
              >
                {selecting ? "Done" : "Select"}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setOrder((o) => (o === "recent" ? "oldest" : "recent"))}
              className="flex h-11 cursor-pointer items-center text-[var(--color-bone-dim)] underline underline-offset-4 transition hover:text-[var(--color-bone)]"
            >
              {order === "recent" ? "Read from the beginning" : "Newest first"}
            </button>
          </span>
        </div>
      ) : null}

      {selecting ? (
        <div
          role="toolbar"
          aria-label="Selected conversations"
          className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-[var(--color-rule)] bg-white/[0.025] px-3 py-2"
        >
          <span className="text-small text-[var(--color-text-secondary)]">
            {chosen.length} selected
          </span>
          <button
            type="button"
            onClick={() =>
              setSelected(
                chosen.length === ordered.length
                  ? new Set()
                  : new Set(ordered.map((c) => c.id)),
              )
            }
            className="cursor-pointer text-small text-[var(--color-bone-dim)] underline underline-offset-4 transition hover:text-[var(--color-bone)]"
          >
            {chosen.length === ordered.length ? "Clear" : "Select all"}
          </button>
          <span className="ml-auto flex items-center gap-3">
            {onExportMany ? (
              <button
                type="button"
                disabled={!chosen.length}
                onClick={() => {
                  onExportMany(chosen);
                  endSelecting();
                }}
                className="cursor-pointer text-small text-[var(--color-bone-dim)] underline underline-offset-4 transition hover:text-[var(--color-bone)] disabled:cursor-default disabled:opacity-40"
              >
                Save as text
              </button>
            ) : null}
            {onDeleteMany ? (
              <button
                type="button"
                disabled={!chosen.length}
                onClick={() => {
                  onDeleteMany(chosen);
                  endSelecting();
                }}
                className="cursor-pointer text-small text-[var(--color-danger)] underline underline-offset-4 transition hover:opacity-80 disabled:cursor-default disabled:opacity-40"
              >
                Delete
              </button>
            ) : null}
          </span>
        </div>
      ) : null}

      {!conversations.length ? (
        <EmptyState compact variant="conversations" title={emptyTitle} body={emptyBody} />
      ) : !filtered.length ? (
        <p className="px-1 py-6 text-center text-small leading-[1.6] text-[var(--color-text-secondary)]">
          Nothing matches “{query.trim()}”.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {groups.map(({ bucket, conversations: rows }) => (
            <section key={bucket} className="flex flex-col gap-1.5">
              <h3 className="px-1 text-micro tracking-[0.14em] text-[var(--color-text-tertiary)] uppercase">
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
                          className="min-w-0 flex-1 bg-transparent px-2 py-2 text-body text-[var(--color-bone)] outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => saveRename(conversation)}
                          className="flex h-11 shrink-0 cursor-pointer items-center rounded-lg px-3 text-small text-[var(--color-ember)] transition hover:bg-white/[0.04]"
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
                      {selecting ? (
                        <label className="flex h-11 w-10 shrink-0 cursor-pointer items-center justify-center">
                          <input
                            type="checkbox"
                            checked={selected.has(conversation.id)}
                            onChange={() => toggle(conversation.id)}
                            aria-label={`Select “${conversation.title}”`}
                            className="h-4 w-4 cursor-pointer accent-[var(--color-ember)]"
                          />
                        </label>
                      ) : null}
                      <button
                        type="button"
                        onClick={() =>
                          selecting ? toggle(conversation.id) : onOpen(conversation)
                        }
                        className={cn(
                          "flex min-w-0 flex-1 cursor-pointer flex-col justify-center gap-1 pr-1 text-left",
                          selecting ? "pl-1" : "pl-3",
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
                              compact ? "text-lead" : "text-lead",
                            )}
                          >
                            {conversation.title}
                          </span>
                        </span>
                        {snippet ? (
                          <span className="truncate text-small leading-[1.5] text-[var(--color-bone-dim)]/70">
                            {snippet}
                          </span>
                        ) : null}
                        <span className="text-micro text-[var(--color-text-tertiary)]">
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
                              {onExport ? (
                                <MenuItem
                                  onClick={() => {
                                    onExport(conversation);
                                    setMenuId(null);
                                  }}
                                >
                                  Save as text
                                </MenuItem>
                              ) : null}
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
        "flex min-h-[42px] w-full cursor-pointer items-center px-3.5 text-left text-small transition-colors",
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
      <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--color-text-tertiary)]">
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
        // The browser draws its own clear button on type="search", which sat
        // next to ours — two crosses in one field.
        className="hairline h-11 w-full appearance-none rounded-xl bg-white/[0.02] pr-10 pl-10 text-body text-[var(--color-bone)] transition placeholder:text-[var(--color-text-tertiary)] focus:border-[var(--color-ember)]/35 focus:outline-none [&::-webkit-search-cancel-button]:appearance-none"
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
