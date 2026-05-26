"use client";

type AnalyticsEvent = {
  name: string;
  properties?: Record<string, string | number | boolean | null>;
  at: number;
};

const KEY = "eternavoice-analytics";
const MAX_EVENTS = 200;

export function trackEvent(
  name: string,
  properties?: Record<string, string | number | boolean | null>,
) {
  if (typeof window === "undefined") return;

  const event: AnalyticsEvent = { name, properties, at: Date.now() };

  try {
    const existing = window.localStorage.getItem(KEY);
    const events = existing ? (JSON.parse(existing) as AnalyticsEvent[]) : [];
    events.push(event);
    window.localStorage.setItem(KEY, JSON.stringify(events.slice(-MAX_EVENTS)));
  } catch {
    // Analytics must never affect product behavior.
  }

  if (process.env.NODE_ENV !== "production") {
    console.info("[analytics]", event);
  }
}
