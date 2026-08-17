export type ChatEvent =
  | { type: "ready" }
  | { type: "text"; turnId: string; delta: string }
  | { type: "audio"; turnId: string; sentenceIndex: number; mime: string; base64: string; pauseMs?: number }
  | { type: "timing"; turnId?: string; label: string; elapsedMs: number }
  | { type: "notice"; message: string; stage?: "tts" | "llm" | "network" }
  | { type: "done"; turnId: string; full: string }
  | { type: "error"; message: string; stage?: "tts" | "llm" | "network" };

/**
 * A script being read aloud. Separate from ChatEvent because a reading has no
 * text stream — the words are already known and sent once up front, so each
 * audio event only needs to say which line it belongs to.
 */
export type ReadEvent =
  | { type: "ready"; segments: string[] }
  | { type: "audio"; index: number; mime: string; base64: string; pauseMs?: number }
  | { type: "notice"; index?: number; message: string }
  | { type: "error"; message: string }
  | { type: "done" };

const encoder = new TextEncoder();

export function encodeSse(event: ChatEvent | ReadEvent): Uint8Array {
  const payload = JSON.stringify(event);
  return encoder.encode(`data: ${payload}\n\n`);
}
