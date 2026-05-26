"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { ChatTurn, ConversationStatus, PersonaConfig, VoiceLibraryItem } from "./types";

export type { ChatTurn, ConversationStatus, PersonaConfig, VoiceLibraryItem };

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
  status: ConversationStatus;

  setVoice: (voiceId: string, name: string) => void;
  setActiveVoice: (voiceId: string) => void;
  renameVoice: (voiceId: string, name: string) => void;
  forgetVoice: (voiceId: string) => void;
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
      voices: [],
      persona: defaultPersona,
      turns: [],
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
            status: "idle",
          };
        }),
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
          voices: [],
          persona: defaultPersona,
          turns: [],
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
        state.status = "idle";
        return state;
      },
    },
  ),
);
