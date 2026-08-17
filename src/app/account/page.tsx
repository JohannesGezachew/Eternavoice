"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { isTrialExpired, trialDaysLeft } from "@/lib/entitlement";
import { fadeUp, stagger } from "@/lib/motion";
import { AppShell } from "@/components/shell/AppShell";
import { buttonClasses } from "@/components/ui/buttonClasses";
import { Input } from "@/components/ui/Field";
import { useSession } from "@/lib/session";

interface Profile {
  subscription_status: string;
  stripe_customer_id: string | null;
  trial_ends_at: string | null;
  display_name: string | null;
}

interface Allowance {
  used: number;
  limit: number;
  fraction: number;
  resetsAt: string;
}
interface UsageResponse {
  chat: Allowance;
  clone: Allowance;
}

/** "on 1 September" — a date, not a countdown. */
function formatResetDate(iso: string): string {
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return "next month";
  return `on ${when.toLocaleDateString("en-GB", { day: "numeric", month: "long" })}`;
}

function formatTrialEnd(isoDate: string): string {
  const d = new Date(isoDate);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
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
      <span className="font-serif text-lead tracking-wide text-[var(--color-ember)]">{initials}</span>
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
  { value: 0.85, label: "Slower", hint: "0.85×" },
  { value: 1, label: "Natural", hint: "1×" },
  { value: 1.15, label: "Faster", hint: "1.15×" },
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

/** Reading sizes. Kept modest — beyond ~1.3 the talk room's fixed chrome
 *  starts to crowd, and the browser's own zoom is the better tool past that. */
const TEXT_SIZES: Array<{ value: number; label: string }> = [
  { value: 1, label: "Default" },
  { value: 1.12, label: "Larger" },
  { value: 1.25, label: "Largest" },
];

function storedTextScale(): number {
  try {
    const s = parseFloat(localStorage.getItem("ev-text-scale") ?? "1");
    return TEXT_SIZES.some((t) => t.value === s) ? s : 1;
  } catch {
    return 1;
  }
}

export default function AccountPage() {
  const router = useRouter();
  const prefs = useSession((s) => s.prefs);
  const setPrefs = useSession((s) => s.setPrefs);
  const voices = useSession((s) => s.voices);
  const conversations = useSession((s) => s.conversations);
  const memories = useSession((s) => s.memories);
  const [appearance, setAppearance] = useState<Appearance>("system");
  const [textScale, setTextScale] = useState(1);
  // What the personas call you. Held locally while typing, saved on blur.
  const [displayName, setDisplayName] = useState("");
  const [nameSaved, setNameSaved] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);

  const saveDisplayName = async () => {
    const next = displayName.replace(/\s+/g, " ").trim().slice(0, 60);
    setDisplayName(next);
    setNameError(null);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase
      .from("profiles")
      .update({ display_name: next || null })
      .eq("id", user.id);
    if (error) {
      setNameError("Couldn't save that. Try again in a moment.");
      return;
    }
    setNameSaved(true);
    window.setTimeout(() => setNameSaved(false), 2400);
  };

  const applyTextScale = (scale: number) => {
    setTextScale(scale);
    try {
      if (scale === 1) localStorage.removeItem("ev-text-scale");
      else localStorage.setItem("ev-text-scale", String(scale));
      document.documentElement.style.setProperty("--ui-scale", String(scale));
    } catch {
      // size stays as-is
    }
  };

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
  const [email, setEmail] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [portalLoading, setPortalLoading] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [usage, setUsage] = useState<UsageResponse | null>(null);

  useEffect(() => {
    // Usage is advisory — if it can't be read, the section simply stays hidden.
    void fetch("/api/usage")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: UsageResponse | null) => setUsage(data))
      .catch(() => null);
  }, []);

  useEffect(() => {
    // Reflect the stored appearance once we're safely past hydration.
    const t = setTimeout(() => {
      setAppearance(storedAppearance());
      setTextScale(storedTextScale());
    }, 0);
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
          .select("subscription_status, stripe_customer_id, trial_ends_at, display_name")
          .eq("id", user.id)
          .single();
        setProfile(data as Profile);
        setDisplayName(((data as Profile | null)?.display_name ?? "").trim());
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

  const signOutAll = async () => {
    setSigningOut(true);
    const supabase = createClient();
    await supabase.auth.signOut({ scope: "global" });
    router.push("/");
  };

  const exportData = () => {
    const data = {
      exportedAt: new Date().toISOString(),
      email,
      conversations: useSession.getState().conversations.map((c) => ({
        title: c.title,
        createdAt: new Date(c.updatedAt).toISOString(),
        turns: c.turns.map((t) => ({ role: t.role, content: t.content })),
      })),
      memories: useSession.getState().memories.map((m) => ({
        content: m.content,
        createdAt: new Date(m.createdAt).toISOString(),
      })),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `eternavoice-export-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
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

  // Derived, not stored: an expired trial must never keep rendering as a live
  // one just because the status column still says "trialing".
  const trialDaysLeftValue = trialDaysLeft(profile?.subscription_status, profile?.trial_ends_at);
  const trialExpired = isTrialExpired(profile?.subscription_status, profile?.trial_ends_at);

  // A run-out trial wears the lapsed styling, not the warm ember of an active
  // one — the badge is the first thing read, so it has to tell the truth.
  const statusKey = trialExpired ? "canceled" : (profile?.subscription_status ?? "inactive");
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
      {/* The visible page title lives in the app bar; screen readers still
          need a real top-level heading before the section h2s. */}
      <h1 className="sr-only">Account</h1>
      <motion.div initial="hidden" animate="enter" variants={stagger(0.07)} className="flex flex-col gap-6">
        {/* User identity */}
        <motion.div variants={fadeUp} className="flex items-center gap-4 py-2">
          <Avatar email={email} />
          <div className="flex flex-col gap-0.5">
            <p className="text-body text-[var(--color-bone)]">{email}</p>
            <p className="text-small text-[var(--color-bone-dim)]/80">Your account</p>
          </div>
        </motion.div>

        {/* What they call you.
            Until this existed the app never knew, so the personas learned your
            name only by accident — whatever the summariser happened to extract
            from a conversation. That is why it ended up written into memories
            as a third-person string. Told once here, it never has to be. */}
        <Section>
          <h2 className="mb-1 text-micro uppercase tracking-[0.14em] text-[var(--color-bone-dim)]/80">
            Your name
          </h2>
          <p className="mb-3 text-small leading-[1.6] text-[var(--color-text-secondary)]">
            What everyone you speak with should call you.
          </p>
          <div className="flex items-center gap-3">
            <Input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              onBlur={() => void saveDisplayName()}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
              }}
              maxLength={60}
              placeholder="Your first name"
              aria-label="Your name"
            />
            <span
              aria-live="polite"
              className="w-16 shrink-0 text-small text-[var(--color-verdigris)]"
            >
              {nameSaved ? "Saved" : ""}
            </span>
          </div>
          {nameError ? (
            <p role="alert" className="mt-2 text-small text-[var(--color-danger)]">
              {nameError}
            </p>
          ) : null}
        </Section>

        {/* Subscription */}
        <Section>
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h2 className="text-micro uppercase tracking-[0.14em] text-[var(--color-bone-dim)]/80">
                Subscription
              </h2>
              <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-micro ${statusCfg.badge}`}>
                <span className={`inline-block h-1.5 w-1.5 rounded-full ${statusCfg.dot}`} />
                {trialExpired
                  ? "Trial ended"
                  : trialDaysLeftValue !== null
                    ? trialDaysLeftValue === 0
                      ? "Trial ends today"
                      : `${trialDaysLeftValue} ${trialDaysLeftValue === 1 ? "day" : "days"} left`
                    : statusCfg.label}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex flex-col gap-0.5">
                <p className="text-body text-[var(--color-bone)]">EternaVoice</p>
                <p className="text-small text-[var(--color-bone-dim)]/80">
                  $30/month · cancel anytime
                  {profile?.trial_ends_at && trialDaysLeftValue !== null && trialDaysLeftValue > 0 && (
                    <span className="block text-[var(--color-ember)]">
                      Ends {formatTrialEnd(profile.trial_ends_at)}
                    </span>
                  )}
                </p>
              </div>
              {profile?.stripe_customer_id ? (
                <button
                  onClick={() => void openPortal()}
                  disabled={portalLoading}
                  className={buttonClasses({ variant: "outline", size: "md", className: "px-4 text-small" })}
                >
                  {portalLoading ? "Opening…" : "Manage billing"}
                </button>
              ) : (
                <Link
                  href="/subscribe"
                  className={buttonClasses({ variant: "primary", size: "md", className: "px-5 text-small" })}
                >
                  Subscribe
                </Link>
              )}
            </div>

            {/* Deliberately silent until usage is actually high — a running
                meter has no place in a product people use to grieve. */}
            {usage && usage.chat.fraction >= 0.8 ? (
              <div className="flex flex-col gap-2 border-t border-[var(--color-rule)] pt-4">
                <div className="flex items-baseline justify-between">
                  <p className="text-small text-[var(--color-bone)]/90">
                    {usage.chat.used >= usage.chat.limit
                      ? "You've used this month's conversations."
                      : "You've used most of this month's conversations."}
                  </p>
                  <span className="text-micro tabular-nums text-[var(--color-bone-dim)]">
                    {Math.min(usage.chat.used, usage.chat.limit)} / {usage.chat.limit}
                  </span>
                </div>
                <div className="h-1 w-full overflow-hidden rounded-full bg-[var(--color-rule-strong)]">
                  <div
                    className="h-full rounded-full bg-[var(--color-ember)]/70"
                    style={{ width: `${Math.round(usage.chat.fraction * 100)}%` }}
                  />
                </div>
                <p className="text-small text-[var(--color-bone-dim)]">
                  Resets {formatResetDate(usage.chat.resetsAt)}. Everything you&rsquo;ve
                  made stays exactly where it is.
                </p>
              </div>
            ) : null}
          </div>
        </Section>

        {/* Usage stats */}
        <Section>
          <h2 className="mb-4 text-micro uppercase tracking-[0.14em] text-[var(--color-bone-dim)]/80">
            Your library
          </h2>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Voices", value: voices.length },
              { label: "Conversations", value: conversations.length },
              { label: "Memories", value: memories.length },
            ].map(({ label, value }) => (
              <div key={label} className="flex flex-col items-center gap-1 rounded-xl bg-white/[0.025] py-3">
                <span className="font-serif text-title leading-none text-[var(--color-bone)]">{value}</span>
                <span className="text-micro text-[var(--color-text-tertiary)]">{label}</span>
              </div>
            ))}
          </div>
          <div className="mt-1 flex flex-col">
            <Link
              href="/people"
              className="flex items-center justify-between rounded-lg px-1 py-2.5 text-small text-[var(--color-bone-dim)] transition hover:text-[var(--color-bone)]"
            >
              View your people
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="opacity-40" aria-hidden>
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </Link>
            <button
              type="button"
              onClick={exportData}
              className="flex items-center justify-between rounded-lg px-1 py-2.5 text-small text-[var(--color-bone-dim)] transition hover:text-[var(--color-bone)]"
            >
              Download my data
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="opacity-40" aria-hidden>
                <path d="M12 5v14M5 12l7 7 7-7" />
              </svg>
            </button>
          </div>
        </Section>

        {/* Appearance */}
        <Section>
          <h2 className="mb-4 text-micro uppercase tracking-[0.14em] text-[var(--color-bone-dim)]/80">
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
                className={`flex-1 cursor-pointer rounded-lg px-3 py-2 text-small transition-colors duration-200 ${
                  appearance === value
                    ? "bg-white/[0.06] text-[var(--color-bone)]"
                    : "text-[var(--color-text-secondary)] hover:text-[var(--color-bone)]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Reading size. Sits with appearance because it is the same kind of
              decision — how the app should look to you — and this audience
              skews older, where it is the difference between comfortable and
              unusable. */}
          <h3 className="mt-6 mb-2 text-small text-[var(--color-bone)]">Reading size</h3>
          <div
            className="flex w-full gap-1 rounded-xl border border-[var(--color-rule)] bg-white/[0.015] p-1"
            role="radiogroup"
            aria-label="Reading size"
          >
            {TEXT_SIZES.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={textScale === value}
                onClick={() => applyTextScale(value)}
                className={`flex-1 cursor-pointer rounded-lg px-3 py-2 transition-colors duration-200 ${
                  textScale === value
                    ? "bg-white/[0.06] text-[var(--color-bone)]"
                    : "text-[var(--color-text-secondary)] hover:text-[var(--color-bone)]"
                }`}
                style={{ fontSize: `${value * 0.8125}rem` }}
              >
                {label}
              </button>
            ))}
          </div>
        </Section>

        {/* Listening preferences */}
        <Section>
          <h2 className="mb-4 text-micro uppercase tracking-[0.14em] text-[var(--color-bone-dim)]/80">
            Listening
          </h2>
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-2.5">
              <p className="text-body text-[var(--color-bone)]">Voice speed</p>
              <div className="flex w-full gap-1 rounded-xl border border-[var(--color-rule)] bg-white/[0.015] p-1" role="radiogroup" aria-label="Voice speed">
                {SPEEDS.map(({ value, label, hint }) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={prefs.playbackRate === value}
                    onClick={() => setPrefs({ playbackRate: value })}
                    className={`flex-1 cursor-pointer rounded-lg px-2 py-2 text-center transition-colors duration-200 ${
                      prefs.playbackRate === value
                        ? "bg-white/[0.06] text-[var(--color-bone)]"
                        : "text-[var(--color-text-secondary)] hover:text-[var(--color-bone)]"
                    }`}
                  >
                    <span className="block text-small">{label}</span>
                    <span className="block text-micro opacity-60">{hint}</span>
                  </button>
                ))}
              </div>
            </div>
            <label className="flex cursor-pointer items-center justify-between gap-4">
              <span className="flex flex-col gap-0.5">
                <span className="text-body text-[var(--color-bone)]">Show transcript by default</span>
                <span className="text-small text-[var(--color-text-tertiary)]">
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
        <motion.div variants={fadeUp} className="flex flex-col gap-2">
          <button
            onClick={() => void signOut()}
            disabled={signingOut}
            className={buttonClasses({ variant: "outline", size: "md", className: "w-full" })}
          >
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
          <button
            onClick={() => void signOutAll()}
            disabled={signingOut}
            className="cursor-pointer text-center text-small text-[var(--color-text-tertiary)] transition hover:text-[var(--color-bone-dim)]"
          >
            Sign out of all devices
          </button>
        </motion.div>

        {/* Danger zone */}
        <motion.div
          variants={fadeUp}
          className="rounded-2xl border border-[var(--color-danger)]/15 bg-[var(--color-danger)]/[0.04] px-6 py-5"
        >
          <h2 className="mb-1 text-micro uppercase tracking-[0.14em] text-[var(--color-danger)]/70">
            Leaving EternaVoice
          </h2>
          <p className="mb-4 text-small leading-relaxed text-[var(--color-bone-dim)]/80">
            Permanently deletes your account, all voice profiles, conversations, and memories. This cannot be undone.
          </p>

          {!deleteConfirm ? (
            <button
              onClick={() => setDeleteConfirm(true)}
              className="text-small text-[var(--color-danger)]/70 underline underline-offset-4 transition hover:text-[var(--color-danger)]"
            >
              Delete my account
            </button>
          ) : (
            <div className="flex flex-col gap-3">
              <p className="text-small font-medium text-[var(--color-danger)]">
                This will permanently delete everything. Are you sure?
              </p>
              {deleteError && (
                <p className="text-small text-[var(--color-danger)]">{deleteError}</p>
              )}
              <div className="flex flex-wrap gap-2.5">
                <button
                  onClick={() => void deleteAccount()}
                  disabled={deleteLoading}
                  className={buttonClasses({ variant: "danger", size: "md", className: "px-4 text-small" })}
                >
                  {deleteLoading ? "Deleting…" : "Yes, delete everything"}
                </button>
                <button
                  onClick={() => setDeleteConfirm(false)}
                  className={buttonClasses({ variant: "outline", size: "md", className: "px-4 text-small" })}
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
