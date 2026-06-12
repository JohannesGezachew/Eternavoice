"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { fadeUp, stagger } from "@/lib/motion";
import { AppShell } from "@/components/shell/AppShell";
import { buttonClasses } from "@/components/ui/buttonClasses";
import { useSession } from "@/lib/session";

interface Profile {
  subscription_status: string;
  stripe_customer_id: string | null;
  trial_ends_at: string | null;
}

const STATUS_CONFIG: Record<string, { label: string; dot: string; badge: string }> = {
  active: {
    label: "Active",
    dot: "bg-[var(--color-sage)]",
    badge: "border-[var(--color-sage)]/25 bg-[var(--color-sage)]/10 text-[var(--color-sage)]",
  },
  trialing: {
    label: "Free trial",
    dot: "bg-[var(--color-ember)]",
    badge: "border-[var(--color-ember)]/25 bg-[var(--color-ember)]/[0.08] text-[var(--color-ember)]",
  },
  past_due: {
    label: "Payment overdue",
    dot: "bg-[var(--color-warning)]",
    badge: "border-[var(--color-warning)]/25 bg-[var(--color-warning)]/10 text-[var(--color-warning)]",
  },
  canceled: {
    label: "Cancelled",
    dot: "bg-[var(--color-bone-dim)]/40",
    badge: "border-[var(--color-rule-strong)] bg-white/[0.04] text-[var(--color-bone-dim)]",
  },
  inactive: {
    label: "No subscription",
    dot: "bg-[var(--color-bone-dim)]/40",
    badge: "border-[var(--color-rule-strong)] bg-white/[0.04] text-[var(--color-bone-dim)]",
  },
};

function Avatar({ email }: { email: string }) {
  const initials = (email.split("@")[0] ?? email).slice(0, 2).toUpperCase();
  return (
    <div
      className="flex h-14 w-14 items-center justify-center rounded-full border border-[var(--color-rule-strong)]"
      style={{
        background: "radial-gradient(closest-side, rgba(194,120,74,0.18), rgba(194,120,74,0.04) 70%, transparent)",
      }}
    >
      <span className="font-serif text-[18px] tracking-wide text-[var(--color-ember)]">{initials}</span>
    </div>
  );
}

function Section({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      variants={fadeUp}
      className="rounded-2xl border border-[var(--color-rule)] bg-white/[0.018] px-6 py-5"
    >
      {children}
    </motion.div>
  );
}

const SPEEDS = [
  { value: 0.85, label: "Slower" },
  { value: 1, label: "Natural" },
  { value: 1.15, label: "Faster" },
];

type Appearance = "light" | "system" | "dark";
const APPEARANCES: Array<{ value: Appearance; label: string }> = [
  { value: "light", label: "Light" },
  { value: "system", label: "System" },
  { value: "dark", label: "Dark" },
];

function storedAppearance(): Appearance {
  try {
    const t = localStorage.getItem("ev-theme");
    return t === "light" || t === "dark" ? t : "system";
  } catch {
    return "system";
  }
}

export default function AccountPage() {
  const router = useRouter();
  const prefs = useSession((s) => s.prefs);
  const setPrefs = useSession((s) => s.setPrefs);
  const [appearance, setAppearance] = useState<Appearance>("system");

  const applyAppearance = (mode: Appearance) => {
    setAppearance(mode);
    try {
      if (mode === "system") localStorage.removeItem("ev-theme");
      else localStorage.setItem("ev-theme", mode);
      const resolved =
        mode === "system"
          ? window.matchMedia("(prefers-color-scheme: dark)").matches
            ? "dark"
            : "light"
          : mode;
      document.documentElement.setAttribute("data-theme", resolved);
    } catch {
      // theme stays as-is
    }
  };
  const [profile, setProfile] = useState<Profile | null>(null);
  // Trial countdown — computed when the profile loads, handled graciously,
  // never as an ambush.
  const [trialDaysLeft, setTrialDaysLeft] = useState<number | null>(null);
  const [email, setEmail] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [portalLoading, setPortalLoading] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    // Reflect the stored appearance once we're safely past hydration.
    const t = setTimeout(() => setAppearance(storedAppearance()), 0);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const load = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setEmail(user.email ?? "");
        const { data } = await supabase
          .from("profiles")
          .select("subscription_status, stripe_customer_id, trial_ends_at")
          .eq("id", user.id)
          .single();
        setProfile(data as Profile);
        const p = data as Profile | null;
        if (p?.subscription_status === "trialing" && p.trial_ends_at) {
          setTrialDaysLeft(
            Math.max(0, Math.ceil((new Date(p.trial_ends_at).getTime() - Date.now()) / 86_400_000)),
          );
        }
      }
      setLoading(false);
    };
    void load();
  }, []);

  const openPortal = async () => {
    setPortalLoading(true);
    const res = await fetch("/api/stripe/portal", { method: "POST" });
    const json = (await res.json()) as { url?: string };
    if (json.url) window.location.href = json.url;
    setPortalLoading(false);
  };

  const signOut = async () => {
    setSigningOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
  };

  const deleteAccount = async () => {
    setDeleteLoading(true);
    setDeleteError(null);
    const res = await fetch("/api/user/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm: "DELETE MY ACCOUNT" }),
    });
    if (res.ok) {
      const supabase = createClient();
      await supabase.auth.signOut();
      window.location.href = "/";
    } else {
      const json = (await res.json()) as { error?: string };
      setDeleteError(json.error ?? "Deletion failed");
      setDeleteLoading(false);
    }
  };

  const statusKey = profile?.subscription_status ?? "inactive";
  const statusCfg = STATUS_CONFIG[statusKey] ?? STATUS_CONFIG["inactive"]!;

  if (loading) {
    // The page shape is known — skeleton it rather than blanking the shell.
    return (
      <AppShell title="Account" showTabs>
        <div
          className="mx-auto flex w-full max-w-lg flex-col gap-6 px-6 py-10 sm:px-8"
          role="status"
          aria-label="Loading"
        >
          <div className="flex items-center gap-4 py-2">
            <div className="h-14 w-14 animate-pulse rounded-full bg-white/[0.04]" />
            <div className="flex flex-col gap-2">
              <div className="h-4 w-48 animate-pulse rounded-md bg-white/[0.04]" />
              <div className="h-3 w-24 animate-pulse rounded-md bg-white/[0.03]" />
            </div>
          </div>
          <div className="h-28 animate-pulse rounded-2xl bg-white/[0.03]" />
          <div className="h-24 animate-pulse rounded-2xl bg-white/[0.03]" />
          <div className="h-36 animate-pulse rounded-2xl bg-white/[0.02]" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Account" showTabs>
    <div className="mx-auto flex w-full max-w-lg flex-col px-6 py-10 sm:px-8">
      <motion.div initial="hidden" animate="enter" variants={stagger(0.07)} className="flex flex-col gap-6">
        {/* User identity */}
        <motion.div variants={fadeUp} className="flex items-center gap-4 py-2">
          <Avatar email={email} />
          <div className="flex flex-col gap-0.5">
            <p className="text-[15px] text-[var(--color-bone)]">{email}</p>
            <p className="text-[12px] text-[var(--color-bone-dim)]/80">Your account</p>
          </div>
        </motion.div>

        {/* Subscription */}
        <Section>
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h2 className="text-[11px] uppercase tracking-[0.14em] text-[var(--color-bone-dim)]/80">
                Subscription
              </h2>
              <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] ${statusCfg.badge}`}>
                <span className={`inline-block h-1.5 w-1.5 rounded-full ${statusCfg.dot}`} />
                {trialDaysLeft !== null
                  ? trialDaysLeft === 0
                    ? "Free trial · last day"
                    : `Free trial · ${trialDaysLeft} ${trialDaysLeft === 1 ? "day" : "days"} left`
                  : statusCfg.label}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex flex-col gap-0.5">
                <p className="text-[14px] text-[var(--color-bone)]">EternaVoice</p>
                <p className="text-[12px] text-[var(--color-bone-dim)]/80">£30/month · cancel anytime</p>
              </div>
              {profile?.stripe_customer_id ? (
                <button
                  onClick={() => void openPortal()}
                  disabled={portalLoading}
                  className={buttonClasses({ variant: "outline", size: "md", className: "px-4 text-[13px]" })}
                >
                  {portalLoading ? "Opening…" : "Manage billing"}
                </button>
              ) : (
                <Link
                  href="/subscribe"
                  className={buttonClasses({ variant: "primary", size: "md", className: "px-5 text-[13px]" })}
                >
                  Subscribe
                </Link>
              )}
            </div>
          </div>
        </Section>

        {/* Quick links */}
        <Section>
          <h2 className="mb-4 text-[11px] uppercase tracking-[0.14em] text-[var(--color-bone-dim)]/80">
            Your data
          </h2>
          <div className="flex flex-col gap-1">
            {[
              { label: "Your people — voices, memories, conversations", href: "/people" },
            ].map(({ label, href }) => (
              <Link
                key={href}
                href={href}
                className="flex items-center justify-between rounded-lg px-1 py-2.5 text-[13px] text-[var(--color-bone-dim)] transition hover:text-[var(--color-bone)]"
              >
                {label}
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="opacity-40" aria-hidden>
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </Link>
            ))}
          </div>
        </Section>

        {/* Appearance */}
        <Section>
          <h2 className="mb-4 text-[11px] uppercase tracking-[0.14em] text-[var(--color-bone-dim)]/80">
            Appearance
          </h2>
          <div className="flex w-full gap-1 rounded-xl border border-[var(--color-rule)] bg-white/[0.015] p-1" role="radiogroup" aria-label="Appearance">
            {APPEARANCES.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={appearance === value}
                onClick={() => applyAppearance(value)}
                className={`flex-1 cursor-pointer rounded-lg px-3 py-2 text-[13px] transition-colors duration-200 ${
                  appearance === value
                    ? "bg-white/[0.06] text-[var(--color-bone)]"
                    : "text-[var(--color-text-secondary)] hover:text-[var(--color-bone)]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </Section>

        {/* Listening preferences */}
        <Section>
          <h2 className="mb-4 text-[11px] uppercase tracking-[0.14em] text-[var(--color-bone-dim)]/80">
            Listening
          </h2>
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-2.5">
              <p className="text-[14px] text-[var(--color-bone)]">Voice speed</p>
              <div className="flex w-full gap-1 rounded-xl border border-[var(--color-rule)] bg-white/[0.015] p-1" role="radiogroup" aria-label="Voice speed">
                {SPEEDS.map(({ value, label }) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={prefs.playbackRate === value}
                    onClick={() => setPrefs({ playbackRate: value })}
                    className={`flex-1 cursor-pointer rounded-lg px-3 py-2 text-[13px] transition-colors duration-200 ${
                      prefs.playbackRate === value
                        ? "bg-white/[0.06] text-[var(--color-bone)]"
                        : "text-[var(--color-text-secondary)] hover:text-[var(--color-bone)]"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <label className="flex cursor-pointer items-center justify-between gap-4">
              <span className="flex flex-col gap-0.5">
                <span className="text-[14px] text-[var(--color-bone)]">Show transcript by default</span>
                <span className="text-[12px] text-[var(--color-text-tertiary)]">
                  Open conversations with every word visible
                </span>
              </span>
              <input
                type="checkbox"
                checked={prefs.transcriptDefault}
                onChange={(e) => setPrefs({ transcriptDefault: e.target.checked })}
                className="h-5 w-5 shrink-0 cursor-pointer accent-[var(--color-ember)]"
              />
            </label>
          </div>
        </Section>

        {/* Session */}
        <motion.div variants={fadeUp}>
          <button
            onClick={() => void signOut()}
            disabled={signingOut}
            className={buttonClasses({ variant: "outline", size: "md", className: "w-full" })}
          >
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
        </motion.div>

        {/* Danger zone */}
        <motion.div
          variants={fadeUp}
          className="rounded-2xl border border-[var(--color-danger)]/15 bg-[var(--color-danger)]/[0.04] px-6 py-5"
        >
          <h2 className="mb-1 text-[11px] uppercase tracking-[0.14em] text-[var(--color-danger)]/70">
            Leaving EternaVoice
          </h2>
          <p className="mb-4 text-[13px] leading-relaxed text-[var(--color-bone-dim)]/80">
            Permanently deletes your account, all voice profiles, conversations, and memories. This cannot be undone.
          </p>

          {!deleteConfirm ? (
            <button
              onClick={() => setDeleteConfirm(true)}
              className="text-[13px] text-[var(--color-danger)]/70 underline underline-offset-4 transition hover:text-[var(--color-danger)]"
            >
              Delete my account
            </button>
          ) : (
            <div className="flex flex-col gap-3">
              <p className="text-[13px] font-medium text-[var(--color-danger)]">
                This will permanently delete everything. Are you sure?
              </p>
              {deleteError && (
                <p className="text-[12px] text-[var(--color-danger)]">{deleteError}</p>
              )}
              <div className="flex flex-wrap gap-2.5">
                <button
                  onClick={() => void deleteAccount()}
                  disabled={deleteLoading}
                  className={buttonClasses({ variant: "danger", size: "md", className: "px-4 text-[13px]" })}
                >
                  {deleteLoading ? "Deleting…" : "Yes, delete everything"}
                </button>
                <button
                  onClick={() => setDeleteConfirm(false)}
                  className={buttonClasses({ variant: "outline", size: "md", className: "px-4 text-[13px]" })}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </motion.div>
      </motion.div>
    </div>
    </AppShell>
  );
}
