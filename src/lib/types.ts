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
  audio?: Array<{
    sentenceIndex: number;
    mime: string;
    base64: string;
    pauseMs?: number;
  }>;
}

export interface ConversationRecord {
  id: string;
  voiceId: string;
  voiceName: string;
  subjectId?: string | null;
  title: string;
  persona: PersonaConfig;
  turns: ChatTurn[];
  createdAt: number;
  updatedAt: number;
  pinned?: boolean;
  archived?: boolean;
}

export interface VoiceLibraryItem {
  id: string;
  name: string;
  createdAt: number;
  subjectId?: string;
}

export interface MemoryItem {
  id: string;
  content: string;
  createdAt: number;
  updatedAt: number;
  /** Person this memory belongs to. Null/undefined = legacy unscoped memory,
   *  shared with every persona for backwards compatibility. */
  subjectId?: string | null;
}

export interface ChatRequestPayload {
  voiceId: string;
  persona: PersonaConfig;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  memories?: Array<{ content: string }>;
  subjectId?: string;
  /** First-ever conversation with this person — the persona gathers memory
   *  by asking to be reminded of the shared life. */
  firstMeeting?: boolean;
}
