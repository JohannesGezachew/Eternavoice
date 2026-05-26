"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type {
  ChatTurn,
  ConversationRecord,
  ConversationStatus,
  PersonaConfig,
  VoiceLibraryItem,
} from "./types";

export type {
  ChatTurn,
  ConversationRecord,
  ConversationStatus,
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
  status: ConversationStatus;

  setVoice: (voiceId: string, name: string) => void;
  setActiveVoice: (voiceId: string) => void;
  renameVoice: (voiceId: string, name: string) => void;
  forgetVoice: (voiceId: string) => void;
  clearVoice: () => void;
  setPersona: (persona: PersonaConfig) => void;
  appendTurn: (turn: ChatTurn) => void;
  appendAssistantToken: (id: string, token: string) => void;
  newConversation: () => void;
  openConversation: (conversationId: string) => void;
  deleteConversation: (conversationId: string) => void;
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
    title: conversationTitle(turns),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  return {
    currentConversationId: id,
    conversations: [
      next,
      ...state.conversations.filter((conversation) => conversation.id !== id),
    ].slice(0, 40),
  };
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
        turns: state.turns.slice(-80),
        conversations: state.conversations.map((conversation) => ({
          ...conversation,
          turns: conversation.turns.slice(-80),
        })),
        currentConversationId: state.currentConversationId,
      }),
      merge: (persisted, current) => {
        const state = { ...current, ...(persisted as Partial<SessionState>) };
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
