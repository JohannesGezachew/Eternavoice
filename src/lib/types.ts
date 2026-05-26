export type ConversationStatus =
  | "idle"
  | "transcribing"
  | "thinking"
  | "speaking";

export interface PersonaConfig {
  mode: "self" | "persona";
  name: string;
  relationship?: string;
  description?: string;
}

export interface ChatTurn {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: number;
}

export interface ConversationRecord {
  id: string;
  voiceId: string;
  voiceName: string;
  title: string;
  persona: PersonaConfig;
  turns: ChatTurn[];
  createdAt: number;
  updatedAt: number;
}

export interface VoiceLibraryItem {
  id: string;
  name: string;
  createdAt: number;
}

export interface ChatRequestPayload {
  voiceId: string;
  persona: PersonaConfig;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
}
