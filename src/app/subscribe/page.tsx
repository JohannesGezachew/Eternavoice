"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { AppShell } from "@/components/shell/AppShell";
import { buttonClasses } from "@/components/ui/buttonClasses";
import { createClient } from "@/lib/supabase/client";
import { fadeUp, stagger } from "@/lib/motion";

const FEATURES = [
  "Unlimited conversations with every voice",
  "Multiple voice profiles — family, friends, anyone",
  "Memory that persists across every session",
  "AES-256 encrypted — your data stays yours",
  "Works on any device, any time",
];

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="mt-0.5 shrink-0" aria-hidden>
      <circle cx="8" cy="8" r="7.5" stroke="rgba(194,120,74,0.25)" />
      <path d="M5 8.5l2 2 4-4" stroke="var(--color-ember)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function SubscribePage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  // The sub-line must match reality: "your free week has ended" is only true
  // for lapsed users, not for someone subscribing voluntarily mid-trial.
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      const { data } = await supabase
        .from("profiles")
        .select("subscription_status")
        .eq("id", user.id)
        .single();
      if (data?.subscription_status) setStatus(data.subscription_status);
    });
  }, []);

  const subline =
    status === "canceled" || status === "past_due"
      ? "Your free week has ended. Everything you made — voices, memories, conversations — is saved and waiting."
      : status === "trialing"
        ? "Your trial is active. Subscribe now and nothing pauses when it ends."
        : "Everything you make — voices, memories, conversations — saved across every device.";

  const startCheckout = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/stripe/checkout", { method: "POST" });
      const json = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !json.url) throw new Error(json.error ?? "Could not start checkout");
      window.location.href = json.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setLoading(false);
    }
  };

  return (
    <AppShell title="Subscribe" backHref="/account" showTabs={false}>
    <div className="relative flex flex-1 flex-col items-center justify-center px-6 py-16">
      {/* Atmospheric glow */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden>
        <div
          className="absolute left-1/2 top-[-5%] h-[55%] w-[65%] -translate-x-1/2 rounded-full opacity-50 blur-[110px]"
          style={{ background: "radial-gradient(closest-side, rgba(194,120,74,0.20), transparent 75%)" }}
        />
      </div>

      <motion.div
        initial="hidden"
        animate="enter"
        variants={stagger(0.08)}
        className="relative z-10 flex w-full max-w-sm flex-col items-center gap-8"
      >
        {/* Headline */}
        <motion.div variants={fadeUp} className="flex flex-col items-center gap-2 text-center">
          <h1 className="font-serif text-[28px] leading-[1.1] tracking-[-0.02em] text-[var(--color-bone)] sm:text-[34px]">
            Keep the conversation going.
          </h1>
          <p className="max-w-xs text-[14px] leading-[1.65] text-[var(--color-bone-dim)]">
            {subline}
          </p>
        </motion.div>

        {/* Pricing card */}
        <motion.div
          variants={fadeUp}
          className="w-full overflow-hidden rounded-2xl border border-[var(--color-rule-strong)]"
          style={{
            background: "linear-gradient(160deg, rgba(255,255,255,0.028) 0%, rgba(255,255,255,0.01) 100%)",
            boxShadow: "0 0 0 1px rgba(194,120,74,0.06) inset, 0 32px 64px rgba(0,0,0,0.35)",
          }}
        >
          {/* Price header */}
          <div className="border-b border-[var(--color-rule)] px-8 py-7">
            <p className="text-[12px] tracking-[0.14em] text-[var(--color-bone-dim)]/80 uppercase">
              EternaVoice
            </p>
            <div className="mt-3 flex items-baseline gap-2.5">
              <span className="font-serif text-[52px] leading-none tracking-[-0.03em] text-[var(--color-bone)]">
                $30
              </span>
              <div className="flex flex-col leading-tight">
                <span className="text-[13px] text-[var(--color-bone-dim)]">/month</span>
                <span className="text-[11px] text-[var(--color-bone-dim)]">billed monthly</span>
              </div>
            </div>
          </div>

          {/* Feature list */}
          <div className="flex flex-col gap-3.5 px-8 py-6">
            {FEATURES.map((f) => (
              <div key={f} className="flex items-start gap-3">
                <CheckIcon />
                <span className="text-[13px] leading-[1.55] text-[var(--color-bone-dim)]">{f}</span>
              </div>
            ))}
          </div>

          {/* CTA */}
          <div className="flex flex-col gap-3 px-8 pb-8">
            {error && (
              <p className="text-[13px] text-[var(--color-danger)]" role="alert">{error}</p>
            )}
            <button
              onClick={() => void startCheckout()}
              disabled={loading}
              className={buttonClasses({ variant: "primary", size: "md", className: "h-12 w-full" })}
            >
              {loading ? (
                <motion.span
                  className="inline-block h-4 w-4 rounded-full border-2 border-[var(--color-ink)]/30 border-t-[var(--color-ink)]"
                  animate={{ rotate: 360 }}
                  transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
                />
              ) : (
                "Continue — $30/month"
              )}
            </button>
            <p className="text-center text-[12px] leading-relaxed text-[var(--color-bone-dim)]/80">
              About $1 a day to keep talking · Cancel anytime · Secure checkout via Stripe
            </p>
          </div>
        </motion.div>
      </motion.div>
    </div>
    </AppShell>
  );
}
