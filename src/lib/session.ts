"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type {
  ChatTurn,
  ConversationRecord,
  ConversationStatus,
  MemoryItem,
  PersonaConfig,
  VoiceLibraryItem,
} from "./types";

export type {
  ChatTurn,
  ConversationRecord,
  ConversationStatus,
  MemoryItem,
  PersonaConfig,
  VoiceLibraryItem,
};

const STORAGE_KEY = "eternavoice-session";

// One-time migration: if a previous build wrote the session to sessionStorage,
// copy it into localStorage so the user keeps their cloned voice across reloads.
if (typeof window !== "undefined") {
  try {
    const inLocal = window.localStorage.getItem(STORAGE_KEY);
    const inSession = window.sessionStorage.getItem(STORAGE_KEY);
    if (!inLocal && inSession) {
      window.localStorage.setItem(STORAGE_KEY, inSession);
    }
  } catch {
    // ignore storage errors
  }
}

export interface ListeningPrefs {
  /** TTS playback rate — slower options matter for older ears. */
  playbackRate: number;
  /** Open the talk page with the transcript already visible. */
  transcriptDefault: boolean;
}

interface SessionState {
  voiceId: string | null;
  voiceCreatedAt: number | null;
  voiceName: string;
  activeSubjectId: string | null;
  voices: VoiceLibraryItem[];
  persona: PersonaConfig;
  turns: ChatTurn[];
  conversations: ConversationRecord[];
  currentConversationId: string | null;
  memories: MemoryItem[];
  status: ConversationStatus;
  prefs: ListeningPrefs;

  setVoice: (voiceId: string, name: string, subjectId?: string) => void;
  setActiveVoice: (voiceId: string, subjectId?: string) => void;
  renameVoice: (voiceId: string, name: string) => void;
  forgetVoice: (voiceId: string) => void;
  clearVoice: () => void;
  setPersona: (persona: PersonaConfig) => void;
  appendTurn: (turn: ChatTurn) => void;
  appendAssistantToken: (id: string, token: string) => void;
  appendAssistantAudio: (
    id: string,
    audio: NonNullable<ChatTurn["audio"]>[number],
  ) => void;
  setTurnFeedback: (id: string, feedback: ChatTurn["feedback"]) => void;
  newConversation: () => void;
  openConversation: (conversationId: string) => void;
  renameConversation: (conversationId: string, title: string) => void;
  toggleConversationPin: (conversationId: string) => void;
  deleteConversation: (conversationId: string) => void;
  addMemory: (content: string, subjectId?: string | null) => void;
  updateMemory: (id: string, content: string) => void;
  deleteMemory: (id: string) => void;
  setStatus: (status: ConversationStatus) => void;
  setPrefs: (prefs: Partial<ListeningPrefs>) => void;
  resetConversation: () => void;
  resetAll: () => void;
  hydrateFromDb: (data: {
    subjects: Array<{ id: string; name: string; voice_id: string | null; created_at: string }>;
    memories: MemoryItem[];
    conversations: ConversationRecord[];
  }) => void;
}

const defaultPersona: PersonaConfig = {
  mode: "self",
  name: "",
};

// Real UUIDs: conversation and turn ids are primary keys in Postgres uuid
// columns — prefixed base36 ids made every DB save fail silently.
function newId(_prefix: string): string {
  return crypto.randomUUID();
}

function conversationTitle(turns: ChatTurn[]): string {
  const firstUser = turns.find((turn) => turn.role === "user" && turn.content.trim());
  const source = firstUser?.content ?? turns.find((turn) => turn.content.trim())?.content;
  if (!source) return "New conversation";
  const clean = source.replace(/\s+/g, " ").trim();
  return clean.length > 64 ? `${clean.slice(0, 61)}...` : clean;
}

function upsertConversation(
  state: SessionState,
  turns: ChatTurn[],
): Pick<SessionState, "conversations" | "currentConversationId"> {
  if (!state.voiceId) {
    return {
      conversations: state.conversations,
      currentConversationId: state.currentConversationId,
    };
  }

  const now = Date.now();
  const id = state.currentConversationId ?? newId("c");
  const existing = state.conversations.find((conversation) => conversation.id === id);
  const next: ConversationRecord = {
    id,
    voiceId: state.voiceId,
    voiceName: state.voiceName,
    subjectId: existing?.subjectId ?? state.activeSubjectId ?? null,
    persona: state.persona,
    turns,
    title: existing?.title ?? conversationTitle(turns),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    pinned: existing?.pinned,
    archived: existing?.archived,
  };

  return {
    currentConversationId: id,
    conversations: sortConversations([
      next,
      ...state.conversations.filter((conversation) => conversation.id !== id),
    ]).slice(0, 40),
  };
}

function sortConversations(conversations: ConversationRecord[]): ConversationRecord[] {
  return [...conversations].sort((a, b) => {
    if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
    return b.updatedAt - a.updatedAt;
  });
}

function updateTurnAudio(
  turns: ChatTurn[],
  id: string,
  audio: NonNullable<ChatTurn["audio"]>[number],
): ChatTurn[] {
  return turns.map((turn) => {
    if (turn.id !== id) return turn;
    const nextAudio = [...(turn.audio ?? [])]
      .filter((item) => item.sentenceIndex !== audio.sentenceIndex)
      .concat(audio)
      .sort((a, b) => a.sentenceIndex - b.sentenceIndex);
    return { ...turn, audio: nextAudio };
  });
}

export const useSession = create<SessionState>()(
  persist(
    (set) => ({
      voiceId: null,
      voiceCreatedAt: null,
      voiceName: "",
      activeSubjectId: null,
      voices: [],
      persona: defaultPersona,
      turns: [],
      conversations: [],
      currentConversationId: null,
      memories: [],
      status: "idle",
      prefs: { playbackRate: 1, transcriptDefault: false },

      setVoice: (voiceId, name, subjectId) =>
        set((s) => {
          const createdAt = Date.now();
          const voices = [
            { id: voiceId, name, createdAt, subjectId },
            ...s.voices.filter((v) => v.id !== voiceId),
          ];
          // A new active voice always starts a fresh thread — turns from a
          // previous persona must never bleed into this one.
          return {
            voiceId,
            voiceName: name,
            voiceCreatedAt: createdAt,
            activeSubjectId: subjectId ?? null,
            voices,
            turns: [],
            currentConversationId: null,
            status: "idle" as const,
          };
        }),
      setActiveVoice: (voiceId, subjectId) =>
        set((s) => {
          const voice = s.voices.find((v) => v.id === voiceId);
          if (!voice) return {};
          return {
            voiceId: voice.id,
            voiceName: voice.name,
            voiceCreatedAt: voice.createdAt,
            activeSubjectId: subjectId ?? voice.subjectId ?? null,
            turns: [],
            currentConversationId: null,
            status: "idle",
          };
        }),
      renameVoice: (voiceId, name) =>
        set((s) => ({
          voices: s.voices.map((v) => (v.id === voiceId ? { ...v, name } : v)),
          voiceName: s.voiceId === voiceId ? name : s.voiceName,
        })),
      forgetVoice: (voiceId) =>
        set((s) => {
          const voices = s.voices.filter((v) => v.id !== voiceId);
          if (s.voiceId !== voiceId) return { voices };
          const next = voices[0];
          return {
            voices,
            voiceId: next?.id ?? null,
            voiceName: next?.name ?? "",
            voiceCreatedAt: next?.createdAt ?? null,
            turns: [],
            currentConversationId: null,
            status: "idle",
          };
        }),
      clearVoice: () => set({ voiceId: null, voiceCreatedAt: null, voiceName: "" }),
      setPersona: (persona) =>
        set((s) => {
          if (!s.currentConversationId) return { persona };
          return {
            persona,
            conversations: s.conversations.map((conversation) =>
              conversation.id === s.currentConversationId
                ? { ...conversation, persona, updatedAt: Date.now() }
                : conversation,
            ),
          };
        }),
      appendTurn: (turn) =>
        set((s) => {
          const turns = [...s.turns, turn];
          return { turns, ...upsertConversation(s, turns) };
        }),
      appendAssistantToken: (id, token) =>
        set((s) => {
          const existing = s.turns.find((t) => t.id === id);
          let turns: ChatTurn[];
          if (!existing) {
            turns = [
              ...s.turns,
              { id, role: "assistant", content: token, createdAt: Date.now() },
            ];
          } else {
            turns = s.turns.map((t) =>
              t.id === id ? { ...t, content: t.content + token } : t,
            );
          }
          return { turns, ...upsertConversation(s, turns) };
        }),
      appendAssistantAudio: (id, audio) =>
        set((s) => {
          const turns = updateTurnAudio(s.turns, id, audio);
          return { turns, ...upsertConversation(s, turns) };
        }),
      setTurnFeedback: (id, feedback) =>
        set((s) => {
          const turns = s.turns.map((t) => (t.id === id ? { ...t, feedback } : t));
          return { turns, ...upsertConversation(s, turns) };
        }),
      newConversation: () =>
        set({ turns: [], currentConversationId: newId("c"), status: "idle" }),
      openConversation: (conversationId) =>
        set((s) => {
          const conversation = s.conversations.find((c) => c.id === conversationId);
          if (!conversation) return {};
          return {
            voiceId: conversation.voiceId || s.voiceId,
            voiceName: conversation.voiceName || s.voiceName,
            activeSubjectId: conversation.subjectId ?? s.activeSubjectId,
            voiceCreatedAt:
              s.voices.find((voice) => voice.id === conversation.voiceId)?.createdAt ??
              s.voiceCreatedAt,
            persona: conversation.persona,
            turns: conversation.turns,
            currentConversationId: conversation.id,
            status: "idle",
          };
        }),
      renameConversation: (conversationId, title) =>
        set((s) => {
          const clean = title.replace(/\s+/g, " ").trim();
          if (!clean) return {};
          return {
            conversations: sortConversations(
              s.conversations.map((conversation) =>
                conversation.id === conversationId
                  ? { ...conversation, title: clean, updatedAt: Date.now() }
                  : conversation,
              ),
            ),
          };
        }),
      toggleConversationPin: (conversationId) =>
        set((s) => ({
          conversations: sortConversations(
            s.conversations.map((conversation) =>
              conversation.id === conversationId
                ? { ...conversation, pinned: !conversation.pinned, updatedAt: Date.now() }
                : conversation,
            ),
          ),
        })),
      deleteConversation: (conversationId) =>
        set((s) => {
          const conversations = s.conversations.filter((c) => c.id !== conversationId);
          if (s.currentConversationId !== conversationId) return { conversations };
          return {
            conversations,
            turns: [],
            currentConversationId: null,
            status: "idle",
          };
        }),
      addMemory: (content, subjectId) =>
        set((s) => {
          const clean = content.replace(/\s+/g, " ").trim();
          if (!clean) return {};
          const now = Date.now();
          return {
            memories: [
              {
                id: newId("m"),
                content: clean,
                createdAt: now,
                updatedAt: now,
                subjectId: subjectId ?? s.activeSubjectId ?? null,
                // Everything added through the store is user-initiated (a note,
                // a "remember this", a reflection) — never the auto-extractor.
                source: "manual" as const,
              },
              ...s.memories,
            ].slice(0, 80),
          };
        }),
      updateMemory: (id, content) =>
        set((s) => {
          const clean = content.replace(/\s+/g, " ").trim();
          if (!clean) return {};
          return {
            memories: s.memories.map((memory) =>
              memory.id === id
                ? { ...memory, content: clean, updatedAt: Date.now() }
                : memory,
            ),
          };
        }),
      deleteMemory: (id) =>
        set((s) => ({ memories: s.memories.filter((memory) => memory.id !== id) })),
      setStatus: (status) => set({ status }),
      setPrefs: (prefs) => set((s) => ({ prefs: { ...s.prefs, ...prefs } })),
      resetConversation: () =>
        set({ turns: [], currentConversationId: newId("c"), status: "idle" }),
      resetAll: () =>
        set({
          voiceId: null,
          voiceCreatedAt: null,
          voiceName: "",
          activeSubjectId: null,
          voices: [],
          persona: defaultPersona,
          turns: [],
          conversations: [],
          currentConversationId: null,
          memories: [],
          status: "idle",
        }),
      hydrateFromDb: ({ subjects, memories, conversations }) =>
        set((s) => {
          // Build voices from subjects that have a voice_id
          const dbVoices: VoiceLibraryItem[] = subjects
            .filter((sub) => sub.voice_id)
            .map((sub) => ({
              id: sub.voice_id!,
              name: sub.name,
              createdAt: new Date(sub.created_at).getTime(),
              subjectId: sub.id,
            }));

          // Merge: prefer DB voices over localStorage voices
          const mergedVoices = dbVoices.length ? dbVoices : s.voices;

          // Merge memories: prefer DB (more authoritative)
          const mergedMemories = memories.length ? memories : s.memories;

          // Merge conversations: prefer DB
          const mergedConversations = conversations.length
            ? sortConversations(conversations)
            : s.conversations;

          // If no active voice but we have DB voices, set the first one
          const firstVoice = mergedVoices[0];
          const voiceId = s.voiceId ?? (firstVoice?.id ?? null);
          const voiceName = voiceId === firstVoice?.id ? (firstVoice?.name ?? s.voiceName) : s.voiceName;
          const activeSubjectId = s.activeSubjectId ?? (firstVoice?.subjectId ?? null);

          return {
            voices: mergedVoices,
            memories: mergedMemories,
            conversations: mergedConversations,
            voiceId,
            voiceName,
            activeSubjectId,
          };
        }),
    }),
    {
      name: STORAGE_KEY,
      // Voice, persona, and turns persist across reloads/browser sessions.
      // Real cross-device persistence still requires auth + a server database.
      storage: createJSONStorage(() =>
        typeof window !== "undefined" ? localStorage : (undefined as unknown as Storage),
      ),
      partialize: (state) => ({
        voiceId: state.voiceId,
        voiceCreatedAt: state.voiceCreatedAt,
        voiceName: state.voiceName,
        voices: state.voices.length
          ? state.voices
          : state.voiceId
            ? [
                {
                  id: state.voiceId,
                  name: state.voiceName || "Saved voice",
                  createdAt: state.voiceCreatedAt ?? Date.now(),
                },
              ]
            : [],
        persona: state.persona,
        turns: state.turns.slice(-80).map((t) => ({ ...t, audio: undefined })),
        conversations: state.conversations.map((conversation) => ({
          ...conversation,
          turns: conversation.turns.slice(-80).map((t) => ({ ...t, audio: undefined })),
        })),
        currentConversationId: state.currentConversationId,
        memories: state.memories,
        prefs: state.prefs,
      }),
      merge: (persisted, current) => {
        const state = { ...current, ...(persisted as Partial<SessionState>) };
        state.memories = state.memories ?? [];
        // Sessions persisted before prefs existed.
        state.prefs = { ...current.prefs, ...(state.prefs ?? {}) };
        state.conversations = sortConversations(state.conversations ?? []);
        if (!state.voices?.length && state.voiceId) {
          state.voices = [
            {
              id: state.voiceId,
              name: state.voiceName || "Saved voice",
              createdAt: state.voiceCreatedAt ?? Date.now(),
            },
          ];
        }
        if (!state.conversations?.length && state.voiceId && state.turns?.length) {
          const now = Date.now();
          const id = state.currentConversationId ?? newId("c");
          state.currentConversationId = id;
          state.conversations = [
            {
              id,
              voiceId: state.voiceId,
              voiceName: state.voiceName,
              title: conversationTitle(state.turns),
              persona: state.persona,
              turns: state.turns,
              createdAt: state.turns[0]?.createdAt ?? now,
              updatedAt: state.turns.at(-1)?.createdAt ?? now,
            },
          ];
        }
        state.status = "idle";
        return state;
      },
    },
  ),
);
