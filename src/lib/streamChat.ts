"use client";

import type { ChatRequestPayload } from "./types";

/**
 * Warm the chat function ahead of the real request — call when the user starts
 * speaking, so the cold-start and connection cost is paid during the ~1–2s of
 * speech + transcription rather than added to time-to-first-word. Throttled so
 * rapid re-triggers don't spam the endpoint. Fire-and-forget.
 */
let lastPrewarm = 0;
export function prewarmChat(): void {
  const now = Date.now();
  if (now - lastPrewarm < 8000) return;
  lastPrewarm = now;
  try {
    void fetch("/api/warmup", { method: "GET", keepalive: true }).catch(() => {});
  } catch {
    // best-effort
  }
}

export type ChatEvent =
  | { type: "ready" }
  | { type: "text"; turnId: string; delta: string }
  | { type: "audio"; turnId: string; sentenceIndex: number; mime: string; base64: string; pauseMs?: number }
  | { type: "timing"; turnId?: string; label: string; elapsedMs: number }
  | { type: "notice"; message: string; stage?: "tts" | "llm" | "network" }
  | { type: "done"; turnId: string; full: string }
  | { type: "error"; message: string; stage?: "tts" | "llm" | "network" };

export async function* streamChat(
  payload: ChatRequestPayload,
  signal?: AbortSignal,
): AsyncGenerator<ChatEvent, void, void> {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  });

  if (!res.ok || !res.body) {
    const contentType = res.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new Error(json?.error || `Chat failed (${res.status}).`);
    }
    const txt = await res.text().catch(() => "");
    throw new Error(txt || `Chat failed (${res.status}).`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let idx = buffer.indexOf("\n\n");
      while (idx !== -1) {
        const raw = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        const line = raw.trim();
        if (line.startsWith("data:")) {
          const json = line.slice(5).trim();
          if (json) {
            try {
              yield JSON.parse(json) as ChatEvent;
            } catch {
              // skip malformed
            }
          }
        }
        idx = buffer.indexOf("\n\n");
      }
    }
  } finally {
    reader.releaseLock();
  }
}
