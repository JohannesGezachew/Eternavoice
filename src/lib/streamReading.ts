"use client";

import type { ReadEvent } from "./sse";

export type { ReadEvent };

/** The month's readings are used up. Nothing failed, so this is typed apart
 *  from a generic error — retrying cannot help and the UI must not offer it. */
export class ReadingAllowanceError extends Error {
  readonly resetsAt?: string;
  constructor(resetsAt?: string) {
    super("monthly_allowance_reached");
    this.name = "ReadingAllowanceError";
    this.resetsAt = resetsAt;
  }
}

/**
 * Consume the reading stream: the split script arrives first, then one audio
 * event per line, strictly in order.
 */
export async function* streamReading(
  payload: { voiceId: string; script: string },
  signal?: AbortSignal,
): AsyncGenerator<ReadEvent, void, void> {
  const res = await fetch("/api/read", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  });

  if (!res.ok || !res.body) {
    const json = (await res.json().catch(() => null)) as
      | { error?: string; resetsAt?: string }
      | null;
    if (json?.error === "monthly_allowance_reached") {
      throw new ReadingAllowanceError(json.resetsAt);
    }
    throw new Error(json?.error || `The reading failed (${res.status}).`);
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
        const line = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 2);
        if (line.startsWith("data:")) {
          const json = line.slice(5).trim();
          if (json) {
            try {
              yield JSON.parse(json) as ReadEvent;
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
