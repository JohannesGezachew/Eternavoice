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

interface SessionState {
  voiceId: string | null;
  voiceCreatedAt: number | null;
  voiceName: string;
  voices: VoiceLibraryItem[];
  persona: PersonaConfig;
  turns: ChatTurn[];
  conversations: ConversationRecord[];
  currentConversationId: string | null;
  memories: MemoryItem[];
  status: ConversationStatus;

  setVoice: (voiceId: string, name: string) => void;
  setActiveVoice: (voiceId: string) => void;
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
  addMemory: (content: string) => void;
  updateMemory: (id: string, content: string) => void;
  deleteMemory: (id: string) => void;
  setStatus: (status: ConversationStatus) => void;
  resetConversation: () => void;
  resetAll: () => void;
}

const defaultPersona: PersonaConfig = {
  mode: "self",
  name: "",
};

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
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
      voices: [],
      persona: defaultPersona,
      turns: [],
      conversations: [],
      currentConversationId: null,
      memories: [],
      status: "idle",

      setVoice: (voiceId, name) =>
        set((s) => {
          const createdAt = Date.now();
          const voices = [
            { id: voiceId, name, createdAt },
            ...s.voices.filter((v) => v.id !== voiceId),
          ];
          return { voiceId, voiceName: name, voiceCreatedAt: createdAt, voices };
        }),
      setActiveVoice: (voiceId) =>
        set((s) => {
          const voice = s.voices.find((v) => v.id === voiceId);
          if (!voice) return {};
          return {
            voiceId: voice.id,
            voiceName: voice.name,
            voiceCreatedAt: voice.createdAt,
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
            voiceId: conversation.voiceId,
            voiceName: conversation.voiceName,
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
      addMemory: (content) =>
        set((s) => {
          const clean = content.replace(/\s+/g, " ").trim();
          if (!clean) return {};
          const now = Date.now();
          return {
            memories: [
              { id: newId("m"), content: clean, createdAt: now, updatedAt: now },
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
      resetConversation: () =>
        set({ turns: [], currentConversationId: newId("c"), status: "idle" }),
      resetAll: () =>
        set({
          voiceId: null,
          voiceCreatedAt: null,
          voiceName: "",
          voices: [],
          persona: defaultPersona,
          turns: [],
          conversations: [],
          currentConversationId: null,
          memories: [],
          status: "idle",
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
      }),
      merge: (persisted, current) => {
        const state = { ...current, ...(persisted as Partial<SessionState>) };
        state.memories = state.memories ?? [];
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
