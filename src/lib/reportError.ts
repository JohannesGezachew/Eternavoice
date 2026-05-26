"use client";

type ErrorPayload = {
  source: string;
  message: string;
  stack?: string;
  digest?: string;
  context?: Record<string, string | number | boolean | null>;
};

export function reportError(
  source: string,
  error: unknown,
  context?: ErrorPayload["context"],
) {
  if (typeof window === "undefined") return;

  const err = error instanceof Error ? error : new Error(String(error));
  const payload: ErrorPayload = {
    source,
    message: err.message,
    stack: err.stack,
    digest: "digest" in err && typeof err.digest === "string" ? err.digest : undefined,
    context,
  };

  try {
    void fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
    });
  } catch {
    // Reporting must never break the product path.
  }
}
