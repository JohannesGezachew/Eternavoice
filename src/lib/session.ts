"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { ChatTurn, ConversationStatus, PersonaConfig } from "./types";

export type { ChatTurn, ConversationStatus, PersonaConfig };

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
  persona: PersonaConfig;
  turns: ChatTurn[];
  status: ConversationStatus;

  setVoice: (voiceId: string, name: string) => void;
  clearVoice: () => void;
  setPersona: (persona: PersonaConfig) => void;
  appendTurn: (turn: ChatTurn) => void;
  appendAssistantToken: (id: string, token: string) => void;
  setStatus: (status: ConversationStatus) => void;
  resetConversation: () => void;
  resetAll: () => void;
}

const defaultPersona: PersonaConfig = {
  mode: "self",
  name: "",
};

export const useSession = create<SessionState>()(
  persist(
    (set) => ({
      voiceId: null,
      voiceCreatedAt: null,
      voiceName: "",
      persona: defaultPersona,
      turns: [],
      status: "idle",

      setVoice: (voiceId, name) =>
        set({ voiceId, voiceName: name, voiceCreatedAt: Date.now() }),
      clearVoice: () => set({ voiceId: null, voiceCreatedAt: null, voiceName: "" }),
      setPersona: (persona) => set({ persona }),
      appendTurn: (turn) =>
        set((s) => ({ turns: [...s.turns, turn] })),
      appendAssistantToken: (id, token) =>
        set((s) => {
          const existing = s.turns.find((t) => t.id === id);
          if (!existing) {
            return {
              turns: [
                ...s.turns,
                { id, role: "assistant", content: token, createdAt: Date.now() },
              ],
            };
          }
          return {
            turns: s.turns.map((t) =>
              t.id === id ? { ...t, content: t.content + token } : t,
            ),
          };
        }),
      setStatus: (status) => set({ status }),
      resetConversation: () => set({ turns: [], status: "idle" }),
      resetAll: () =>
        set({
          voiceId: null,
          voiceCreatedAt: null,
          voiceName: "",
          persona: defaultPersona,
          turns: [],
          status: "idle",
        }),
    }),
    {
      name: STORAGE_KEY,
      // Voice + persona persist across reloads / browser sessions so the user
      // never has to re-record. Conversation turns intentionally do NOT persist:
      // every visit starts a fresh conversation, but with the same voice.
      storage: createJSONStorage(() =>
        typeof window !== "undefined" ? localStorage : (undefined as unknown as Storage),
      ),
      partialize: (state) => ({
        voiceId: state.voiceId,
        voiceCreatedAt: state.voiceCreatedAt,
        voiceName: state.voiceName,
        persona: state.persona,
      }),
    },
  ),
);
