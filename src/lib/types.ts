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
  catchphrases?: string;
  avoidPhrases?: string;
  speechStyle?: {
    warmth: number;
    directness: number;
    expressiveness: number;
    humor: number;
    talkativeness: number;
  };
  calibration?: {
    tooFormal?: boolean;
    tooCheerful?: boolean;
    tooManyQuestions?: boolean;
    tooLong?: boolean;
    notWarmEnough?: boolean;
  };
}

export interface ChatTurn {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: number;
  feedback?: "more-like-this" | "too-ai" | "too-long" | "wrong-tone";
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
