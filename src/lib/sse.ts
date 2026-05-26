export type ChatEvent =
  | { type: "ready" }
  | { type: "text"; turnId: string; delta: string }
  | { type: "audio"; turnId: string; sentenceIndex: number; mime: string; base64: string }
  | { type: "notice"; message: string; stage?: "tts" | "llm" | "network" }
  | { type: "done"; turnId: string; full: string }
  | { type: "error"; message: string; stage?: "tts" | "llm" | "network" };

const encoder = new TextEncoder();

export function encodeSse(event: ChatEvent): Uint8Array {
  const payload = JSON.stringify(event);
  return encoder.encode(`data: ${payload}\n\n`);
}
