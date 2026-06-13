"use client";

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useSyncExternalStore,
  Suspense,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import { Mark } from "@/components/shell/Mark";
import { Input } from "@/components/ui/Field";
import { buttonClasses } from "@/components/ui/buttonClasses";
import { fadeUp, stagger } from "@/lib/motion";

type View = "auth" | "confirm" | "magic-sent" | "forgot" | "forgot-sent";
type AuthMode = "sign-in" | "sign-up";

/* ── Product promises ────────────────────────────────────────────────────── */
const PROMISES = [
  {
    quote: "Their voice never leaves your account. It is never shared, never used to train anything, never heard by anyone but you.",
    label: "Private by design",
  },
  {
    quote: "Ninety seconds of any recording — a voicemail, a video, a voice note — is enough to begin.",
    label: "Start with what you have",
  },
  {
    quote: "Delete everything, any time. One button, no questions, nothing retained.",
    label: "Yours to keep or erase",
  },
];

/* ── Helpers ─────────────────────────────────────────────────────────────── */
function friendlyError(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes("invalid login credentials") || m.includes("invalid password") || m.includes("wrong password"))
    return "Incorrect email or password.";
  if (m.includes("email not confirmed"))
    return "Please confirm your email first — check your inbox.";
  if (m.includes("user already registered"))
    return "An account with this email already exists. Try signing in instead.";
  if (m.includes("password should be at least"))
    return "Password must be at least 8 characters.";
  if (m.includes("invalid or has expired") || m.includes("expired"))
    return "That link has expired — try signing in again.";
  if (m.includes("can only request this after") || m.includes("rate"))
    return "Just a moment — wait a few seconds then try again.";
  if (m.includes("invalid format") || m.includes("invalid email"))
    return "That doesn't look like a valid email address.";
  return msg;
}

function passwordStrength(pw: string): { score: 0 | 1 | 2 | 3; label: string } {
  if (pw.length < 8) return { score: 0, label: "Too short" };
  let s = 1;
  if (pw.length >= 12) s++;
  if (/[A-Z]/.test(pw) && /[0-9]/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  const score = Math.min(3, s) as 0 | 1 | 2 | 3;
  return { score, label: ["Weak", "Fair", "Good", "Strong"][score]! };
}

const STRENGTH_COLORS = [
  "bg-[var(--color-danger)]",
  "bg-amber-400",
  "bg-yellow-300",
  "bg-emerald-400",
];

const subscribeNoop = () => () => {};

function storedVoiceName(): string | null {
  try {
    const raw = localStorage.getItem("eternavoice-session");
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { state?: { voiceId?: unknown; voiceName?: unknown } };
    if (!parsed?.state?.voiceId) return null;
    return typeof parsed.state.voiceName === "string" && parsed.state.voiceName.trim()
      ? parsed.state.voiceName.trim()
      : "";
  } catch {
    return null;
  }
}

function getEmailProvider(email: string): { label: string; url: string } | null {
  const domain = email.split("@")[1]?.toLowerCase();
  if (!domain) return null;
  if (domain === "gmail.com") return { label: "Open Gmail", url: "https://mail.google.com" };
  if (["outlook.com", "hotmail.com", "live.com"].includes(domain))
    return { label: "Open Outlook", url: "https://outlook.live.com" };
  if (domain === "yahoo.com") return { label: "Open Yahoo Mail", url: "https://mail.yahoo.com" };
  return null;
}

/* ── Split 6-digit OTP input ─────────────────────────────────────────────── */
function OtpInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const refs = useRef<Array<HTMLInputElement | null>>([null, null, null, null, null, null]);
  const digits = value.padEnd(6, "").slice(0, 6).split("");

  const focus = (i: number) => refs.current[i]?.focus();

  const handleChange = useCallback(
    (i: number, char: string) => {
      const d = char.replace(/\D/g, "").slice(-1);
      const next = digits.map((v, idx) => (idx === i ? d : v)).join("").trimEnd();
      onChange(next.padEnd(Math.min(next.length, 6), "").slice(0, 6));
      if (d && i < 5) setTimeout(() => focus(i + 1), 0);
    },
    [digits, onChange],
  );

  const handleKeyDown = useCallback(
    (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Backspace") {
        if (digits[i]) {
          const next = digits.map((v, idx) => (idx === i ? "" : v)).join("").replace(/\s/g, "");
          onChange(next);
        } else if (i > 0) {
          focus(i - 1);
        }
      } else if (e.key === "ArrowLeft" && i > 0) {
        focus(i - 1);
      } else if (e.key === "ArrowRight" && i < 5) {
        focus(i + 1);
      }
    },
    [digits, onChange],
  );

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      e.preventDefault();
      const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
      onChange(pasted);
      const nextFocus = Math.min(pasted.length, 5);
      setTimeout(() => focus(nextFocus), 0);
    },
    [onChange],
  );

  return (
    <div className="flex gap-2" role="group" aria-label="6-digit code">
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <input
          key={i}
          ref={(el) => { refs.current[i] = el; }}
          type="text"
          inputMode="numeric"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          maxLength={1}
          value={digits[i] ?? ""}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={handlePaste}
          onFocus={(e) => e.target.select()}
          aria-label={`Digit ${i + 1}`}
          className="h-12 w-10 flex-1 rounded-xl bg-white/[0.025] text-center text-[18px] tracking-tight text-[var(--color-bone)] transition-[border-color,background] duration-200 hairline focus:bg-white/[0.04] focus:border-[var(--color-ember)]/40 focus:outline-none sm:w-12 sm:h-14"
        />
      ))}
    </div>
  );
}

/* ── Auth form ───────────────────────────────────────────────────────────── */
function AuthForm() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/people";
  const errorParam = searchParams.get("error");
  const router = useRouter();

  const [view, setView] = useState<View>("auth");
  const [mode, setMode] = useState<AuthMode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [code, setCode] = useState("");

  const [loading, setLoading] = useState(false);
  const [loadingGoogle, setLoadingGoogle] = useState(false);
  const [loadingApple, setLoadingApple] = useState(false);
  const [verifyingCode, setVerifyingCode] = useState(false);
  const [emailTouched, setEmailTouched] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [error, setError] = useState<string | null>(
    errorParam === "auth_failed" ? "Sign-in link expired or already used. Try again." : null,
  );

  const returningName = useSyncExternalStore(subscribeNoop, storedVoiceName, () => null);
  const isReturning = returningName !== null;

  const [resendCooldown, setResendCooldown] = useState(0);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const strength = mode === "sign-up" && password ? passwordStrength(password) : null;
  const provider = (view === "magic-sent" || view === "confirm" || view === "forgot-sent")
    ? getEmailProvider(email)
    : null;

  useEffect(() => {
    return () => { if (cooldownRef.current) clearInterval(cooldownRef.current); };
  }, []);

  const startCooldown = () => {
    setResendCooldown(60);
    cooldownRef.current = setInterval(() => {
      setResendCooldown((c) => {
        if (c <= 1) { clearInterval(cooldownRef.current!); return 0; }
        return c - 1;
      });
    }, 1000);
  };

  /* ── Password auth ───────────────────────────────────────────────────── */
  const submitAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedEmail = email.trim().toLowerCase();
    setError(null);
    setLoading(true);
    const supabase = createClient();

    if (mode === "sign-up") {
      if (password.length < 8) {
        setError("Password must be at least 8 characters.");
        setLoading(false);
        return;
      }
      if (password !== confirmPassword) {
        setError("Passwords don't match.");
        setLoading(false);
        return;
      }
      const { data, error: err } = await supabase.auth.signUp({
        email: trimmedEmail,
        password,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${next}` },
      });
      setLoading(false);
      if (err) { setError(friendlyError(err.message)); return; }
      // If email confirmation is disabled in Supabase, session is granted immediately
      if (data.session) { router.push(next); return; }
      setView("confirm");
      startCooldown();
    } else {
      const { error: err } = await supabase.auth.signInWithPassword({
        email: trimmedEmail,
        password,
      });
      setLoading(false);
      if (err) setError(friendlyError(err.message));
      else router.push(next);
    }
  };

  /* ── Magic link ──────────────────────────────────────────────────────── */
  const sendMagicLink = async (emailAddr: string) => {
    const supabase = createClient();
    const { error: err } = await supabase.auth.signInWithOtp({
      email: emailAddr,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${next}` },
    });
    return err;
  };

  const submitMagicLink = async () => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) { setError("Enter your email address first."); return; }
    setLoading(true);
    setError(null);
    const err = await sendMagicLink(trimmed);
    setLoading(false);
    if (err) setError(friendlyError(err.message));
    else { setView("magic-sent"); startCooldown(); }
  };

  const resendMagicLink = async () => {
    if (resendCooldown > 0) return;
    setError(null);
    const err = await sendMagicLink(email.trim().toLowerCase());
    if (err) setError(friendlyError(err.message));
    else startCooldown();
  };

  const resendConfirmation = async () => {
    if (resendCooldown > 0) return;
    setError(null);
    const supabase = createClient();
    const { error: err } = await supabase.auth.resend({
      type: "signup",
      email: email.trim().toLowerCase(),
      options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${next}` },
    });
    if (err) setError(friendlyError(err.message));
    else startCooldown();
  };

  const verifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = code.trim();
    if (token.length < 6) return;
    setVerifyingCode(true);
    setError(null);
    const supabase = createClient();
    const { error: err } = await supabase.auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token,
      type: "email",
    });
    setVerifyingCode(false);
    if (err) setError(friendlyError(err.message));
    else router.push(next);
  };

  /* ── OAuth ───────────────────────────────────────────────────────────── */
  const signInWithGoogle = async () => {
    setLoadingGoogle(true);
    setError(null);
    const supabase = createClient();
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback?next=${next}` },
    });
    if (err) { setError(friendlyError(err.message)); setLoadingGoogle(false); }
  };

  const signInWithApple = async () => {
    setLoadingApple(true);
    setError(null);
    const supabase = createClient();
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider: "apple",
      options: { redirectTo: `${window.location.origin}/auth/callback?next=${next}` },
    });
    if (err) { setError(friendlyError(err.message)); setLoadingApple(false); }
  };

  /* ── Forgot password ─────────────────────────────────────────────────── */
  const submitForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) { setError("Enter your email address."); return; }
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error: err } = await supabase.auth.resetPasswordForEmail(trimmed, {
      redirectTo: `${window.location.origin}/auth/callback?type=recovery`,
    });
    setLoading(false);
    if (err) setError(friendlyError(err.message));
    else { setView("forgot-sent"); startCooldown(); }
  };

  const resendForgot = async () => {
    if (resendCooldown > 0) return;
    setError(null);
    const supabase = createClient();
    const { error: err } = await supabase.auth.resetPasswordForEmail(
      email.trim().toLowerCase(),
      { redirectTo: `${window.location.origin}/auth/callback?type=recovery` },
    );
    if (err) setError(friendlyError(err.message));
    else startCooldown();
  };

  /* ── Headings & subtext ──────────────────────────────────────────────── */
  const heading: Record<View, string> = {
    auth: mode === "sign-up"
      ? "Create your account"
      : isReturning && returningName
        ? `${returningName} is waiting`
        : isReturning
          ? "Your voices are waiting"
          : "Welcome back",
    confirm: "Check your inbox",
    "magic-sent": "Check your inbox",
    forgot: "Reset your password",
    "forgot-sent": "Check your inbox",
  };
  const subtext: Record<View, string> = {
    auth: mode === "sign-up"
      ? "Free for 7 days — no card taken now."
      : isReturning
        ? "Sign in to pick up where you left off."
        : "Sign in to your account.",
    confirm: `We sent a confirmation link to ${email}`,
    "magic-sent": `We sent a 6-digit code to ${email}`,
    forgot: "We'll send a link to reset it.",
    "forgot-sent": `We sent a reset link to ${email}`,
  };

  return (
    <motion.div
      initial="hidden"
      animate="enter"
      variants={stagger(0.06)}
      className="flex w-full flex-col gap-6"
    >
      {/* Header */}
      <motion.div variants={fadeUp} className="flex flex-col gap-1.5">
        <AnimatePresence mode="wait">
          <motion.h1
            key={`${view}-${mode}-heading`}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.25 }}
            className="font-serif text-[28px] leading-tight tracking-[-0.02em] text-[var(--color-bone)] sm:text-[32px]"
          >
            {heading[view]}
          </motion.h1>
        </AnimatePresence>
        <AnimatePresence mode="wait">
          <motion.p
            key={`${view}-${mode}-subtext`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="text-[14px] leading-relaxed text-[var(--color-bone-dim)]"
          >
            {subtext[view]}
          </motion.p>
        </AnimatePresence>
      </motion.div>

      <AnimatePresence mode="wait">
        {/* ── Auth: main form ─────────────────────────────────────────── */}
        {view === "auth" && (
          <motion.div
            key="auth"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="flex flex-col gap-4"
          >
            {/* Google */}
            <button
              type="button"
              onClick={() => void signInWithGoogle()}
              disabled={loadingGoogle || loading}
              className={buttonClasses({ variant: "outline", size: "md", className: "h-12 w-full" })}
            >
              {loadingGoogle ? (
                <><Spinner /><span className="text-[13px] text-[var(--color-bone-dim)]">Redirecting…</span></>
              ) : (
                <><GoogleIcon />Continue with Google</>
              )}
            </button>

            {/* Apple */}
            {process.env.NEXT_PUBLIC_ENABLE_APPLE_AUTH === "true" && (
              <button
                type="button"
                onClick={() => void signInWithApple()}
                disabled={loadingApple || loading}
                className={buttonClasses({ variant: "outline", size: "md", className: "h-12 w-full" })}
              >
                {loadingApple
                  ? <Spinner />
                  : <><AppleIcon />Continue with Apple</>}
              </button>
            )}

            {/* Divider */}
            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-[var(--color-rule-strong)]" />
              <span className="text-[11px] tracking-[0.12em] text-[var(--color-bone-dim)]/80 uppercase">or</span>
              <div className="h-px flex-1 bg-[var(--color-rule-strong)]" />
            </div>

            {/* Email + password form */}
            <form onSubmit={(e) => void submitAuth(e)} className="flex flex-col gap-3">
              {/* Email */}
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="email"
                  className="text-[11px] tracking-[0.1em] text-[var(--color-bone-dim)]/70 uppercase"
                >
                  Email
                </label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  autoFocus
                  required
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); if (emailTouched) setError(null); }}
                  onBlur={() => {
                    setEmailTouched(true);
                    const trimmed = email.trim();
                    if (trimmed && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
                      setError("That doesn't look like a valid email address.");
                    }
                  }}
                  placeholder="you@example.com"
                  disabled={loading}
                  className="h-12 disabled:opacity-50"
                />
              </div>

              {/* Password */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="password"
                    className="text-[11px] tracking-[0.1em] text-[var(--color-bone-dim)]/70 uppercase"
                  >
                    Password
                  </label>
                  {mode === "sign-in" && (
                    <button
                      type="button"
                      onClick={() => { setError(null); setView("forgot"); }}
                      className="text-[11px] text-[var(--color-ember)]/80 transition hover:text-[var(--color-ember)]"
                    >
                      Forgot password?
                    </button>
                  )}
                </div>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
                    required
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onFocus={() => setPasswordFocused(true)}
                    onBlur={() => setPasswordFocused(false)}
                    placeholder="••••••••"
                    disabled={loading}
                    className="h-12 pr-11 disabled:opacity-50"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    tabIndex={-1}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[var(--color-bone-dim)]/40 transition hover:text-[var(--color-bone-dim)]"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                  </button>
                </div>

                {/* Focus hint for sign-up before the user starts typing */}
                <AnimatePresence>
                  {mode === "sign-up" && passwordFocused && !password && (
                    <motion.p
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.15 }}
                      className="overflow-hidden text-[11px] text-[var(--color-text-tertiary)]"
                    >
                      At least 8 characters. A mix of letters, numbers, and symbols makes it stronger.
                    </motion.p>
                  )}
                </AnimatePresence>

                {/* Strength indicator */}
                <AnimatePresence>
                  {mode === "sign-up" && password && strength && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.2 }}
                      className="flex flex-col gap-1 overflow-hidden"
                    >
                      <div className="flex gap-1 pt-1">
                        {[0, 1, 2, 3].map((i) => (
                          <div
                            key={i}
                            className={`h-[3px] flex-1 rounded-full transition-colors duration-300 ${
                              i <= strength.score
                                ? STRENGTH_COLORS[strength.score]
                                : "bg-[var(--color-rule-strong)]"
                            }`}
                          />
                        ))}
                      </div>
                      <span className="text-[11px] text-[var(--color-bone-dim)]/60">
                        {strength.label}
                      </span>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Confirm password — sign-up only */}
              <AnimatePresence>
                {mode === "sign-up" && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                    className="flex flex-col gap-1.5 overflow-hidden"
                  >
                    <label
                      htmlFor="confirm-password"
                      className="text-[11px] tracking-[0.1em] text-[var(--color-bone-dim)]/70 uppercase"
                    >
                      Confirm password
                    </label>
                    <div className="relative">
                      <Input
                        id="confirm-password"
                        type={showConfirmPassword ? "text" : "password"}
                        autoComplete="new-password"
                        required
                        minLength={8}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="••••••••"
                        disabled={loading}
                        className="h-12 pr-11 disabled:opacity-50"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword((v) => !v)}
                        tabIndex={-1}
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[var(--color-bone-dim)]/40 transition hover:text-[var(--color-bone-dim)]"
                        aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                      >
                        {showConfirmPassword ? <EyeOffIcon /> : <EyeIcon />}
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {error && (
                <p className="text-[13px] text-[var(--color-danger)]" role="alert">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={loading || !email.trim() || !password}
                className={buttonClasses({
                  variant: "primary",
                  size: "md",
                  className: "mt-1 h-12 w-full",
                })}
              >
                {loading
                  ? <Spinner dark />
                  : mode === "sign-up"
                    ? "Create account"
                    : "Sign in"}
              </button>
            </form>

            {/* Magic link alternative */}
            <div className="text-center">
              <button
                type="button"
                onClick={() => void submitMagicLink()}
                disabled={loading || !email.trim()}
                className="text-[12px] text-[var(--color-bone-dim)]/55 underline underline-offset-4 transition hover:text-[var(--color-bone-dim)] disabled:opacity-40"
              >
                Sign in with an email code
              </button>
            </div>

            {/* Mode toggle */}
            <p className="text-center text-[13px] text-[var(--color-text-secondary)]">
              {mode === "sign-in" ? (
                <>
                  Don&apos;t have an account?{" "}
                  <button
                    type="button"
                    onClick={() => {
                      setMode("sign-up");
                      setError(null);
                      setPassword("");
                      setConfirmPassword("");
                    }}
                    className="text-[var(--color-ember)] underline underline-offset-4 transition hover:opacity-80"
                  >
                    Create one
                  </button>
                </>
              ) : (
                <>
                  Already have an account?{" "}
                  <button
                    type="button"
                    onClick={() => {
                      setMode("sign-in");
                      setError(null);
                      setPassword("");
                      setConfirmPassword("");
                    }}
                    className="text-[var(--color-ember)] underline underline-offset-4 transition hover:opacity-80"
                  >
                    Sign in
                  </button>
                </>
              )}
            </p>

            {/* Terms */}
            <p className="text-center text-[11px] leading-relaxed text-[var(--color-text-tertiary)]">
              By continuing you agree to our{" "}
              <a
                href="/terms"
                className="underline underline-offset-4 transition hover:text-[var(--color-bone-dim)]/90"
              >
                Terms
              </a>{" "}
              and{" "}
              <a
                href="/privacy"
                className="underline underline-offset-4 transition hover:text-[var(--color-bone-dim)]/90"
              >
                Privacy Policy
              </a>
              .
            </p>
          </motion.div>
        )}

        {/* ── Confirm: email confirmation after sign-up ─────────────── */}
        {view === "confirm" && (
          <motion.div
            key="confirm"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="flex flex-col gap-5"
          >
            <p className="text-[13px] leading-relaxed text-[var(--color-bone-dim)]">
              Click the link in the email to activate your account. It expires in 1 hour.
              Check spam if nothing arrives within a minute.
            </p>

            {provider && (
              <a
                href={provider.url}
                target="_blank"
                rel="noopener noreferrer"
                className={buttonClasses({
                  variant: "outline",
                  size: "md",
                  className: "w-full text-[13px]",
                })}
              >
                {provider.label} →
              </a>
            )}

            {error && (
              <p className="text-[13px] text-[var(--color-danger)]" role="alert">{error}</p>
            )}

            <div className="mt-1 rounded-xl border border-[var(--color-rule)] bg-white/[0.02] px-4 py-3.5">
              <p className="text-[11px] tracking-[0.14em] text-[var(--color-ember)] uppercase">
                While you wait
              </p>
              <p className="mt-1.5 text-[13px] leading-[1.65] text-[var(--color-text-secondary)]">
                Find a recording of their voice — a voicemail, a video, a voice note.
                Ninety seconds of them speaking clearly is enough to begin.
              </p>
            </div>

            <div className="flex items-center gap-5">
              <button
                onClick={() => void resendConfirmation()}
                disabled={resendCooldown > 0}
                className="text-[13px] text-[var(--color-ember)] underline underline-offset-4 transition hover:opacity-70 disabled:cursor-default disabled:opacity-50"
              >
                {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend email"}
              </button>
              <button
                onClick={() => {
                  setView("auth");
                  setEmail("");
                  setPassword("");
                  setConfirmPassword("");
                  setError(null);
                }}
                className="text-[13px] text-[var(--color-bone-dim)]/80 underline underline-offset-4 transition hover:text-[var(--color-bone-dim)]"
              >
                Different email
              </button>
            </div>
          </motion.div>
        )}

        {/* ── Magic-sent: OTP code entry ────────────────────────────── */}
        {view === "magic-sent" && (
          <motion.div
            key="magic-sent"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="flex flex-col gap-5"
          >
            <form onSubmit={(e) => void verifyCode(e)} className="flex flex-col gap-3">
              <label className="text-[11px] tracking-[0.1em] text-[var(--color-bone-dim)] uppercase">
                Enter the 6-digit code
              </label>
              <OtpInput value={code} onChange={setCode} />
              <button
                type="submit"
                disabled={verifyingCode || code.length < 6}
                className={buttonClasses({
                  variant: "primary",
                  size: "md",
                  className: "h-12 w-full",
                })}
              >
                {verifyingCode ? <Spinner dark /> : "Sign in"}
              </button>
            </form>

            <p className="text-[13px] leading-relaxed text-[var(--color-bone-dim)]">
              Check spam if nothing arrives within a minute. The code expires in 1 hour.
            </p>

            {provider && (
              <a
                href={provider.url}
                target="_blank"
                rel="noopener noreferrer"
                className={buttonClasses({
                  variant: "outline",
                  size: "md",
                  className: "w-full text-[13px]",
                })}
              >
                {provider.label} →
              </a>
            )}

            {error && (
              <p className="text-[13px] text-[var(--color-danger)]" role="alert">{error}</p>
            )}

            <div className="mt-1 rounded-xl border border-[var(--color-rule)] bg-white/[0.02] px-4 py-3.5">
              <p className="text-[11px] tracking-[0.14em] text-[var(--color-ember)] uppercase">
                While you wait
              </p>
              <p className="mt-1.5 text-[13px] leading-[1.65] text-[var(--color-text-secondary)]">
                Find a recording of their voice — a voicemail, a video, a voice note.
                Ninety seconds of them speaking clearly is enough to begin.
              </p>
            </div>

            <div className="flex items-center gap-5">
              <button
                onClick={() => void resendMagicLink()}
                disabled={resendCooldown > 0}
                className="text-[13px] text-[var(--color-ember)] underline underline-offset-4 transition hover:opacity-70 disabled:cursor-default disabled:opacity-50"
              >
                {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend email"}
              </button>
              <button
                onClick={() => { setView("auth"); setEmail(""); setCode(""); setError(null); }}
                className="text-[13px] text-[var(--color-bone-dim)]/80 underline underline-offset-4 transition hover:text-[var(--color-bone-dim)]"
              >
                Different email
              </button>
            </div>
          </motion.div>
        )}

        {/* ── Forgot password: request reset ────────────────────────── */}
        {view === "forgot" && (
          <motion.div
            key="forgot"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="flex flex-col gap-4"
          >
            <form onSubmit={(e) => void submitForgot(e)} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="forgot-email"
                  className="text-[11px] tracking-[0.1em] text-[var(--color-bone-dim)]/70 uppercase"
                >
                  Email address
                </label>
                <Input
                  id="forgot-email"
                  type="email"
                  autoComplete="email"
                  autoFocus
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  disabled={loading}
                  className="h-12 disabled:opacity-50"
                />
              </div>

              {error && (
                <p className="text-[13px] text-[var(--color-danger)]" role="alert">{error}</p>
              )}

              <button
                type="submit"
                disabled={loading || !email.trim()}
                className={buttonClasses({
                  variant: "primary",
                  size: "md",
                  className: "h-12 w-full",
                })}
              >
                {loading ? <Spinner dark /> : "Send reset link"}
              </button>
            </form>

            <button
              type="button"
              onClick={() => { setView("auth"); setError(null); }}
              className="text-[13px] text-[var(--color-bone-dim)]/70 underline underline-offset-4 transition hover:text-[var(--color-bone-dim)]"
            >
              ← Back to sign in
            </button>
          </motion.div>
        )}

        {/* ── Forgot-sent: reset email sent ─────────────────────────── */}
        {view === "forgot-sent" && (
          <motion.div
            key="forgot-sent"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="flex flex-col gap-5"
          >
            <p className="text-[13px] leading-relaxed text-[var(--color-bone-dim)]">
              Click the link in the email to set a new password. The link expires in 1 hour.
              Check spam if nothing arrives within a minute.
            </p>

            {provider && (
              <a
                href={provider.url}
                target="_blank"
                rel="noopener noreferrer"
                className={buttonClasses({
                  variant: "outline",
                  size: "md",
                  className: "w-full text-[13px]",
                })}
              >
                {provider.label} →
              </a>
            )}

            {error && (
              <p className="text-[13px] text-[var(--color-danger)]" role="alert">{error}</p>
            )}

            <div className="flex items-center gap-5">
              <button
                onClick={() => void resendForgot()}
                disabled={resendCooldown > 0}
                className="text-[13px] text-[var(--color-ember)] underline underline-offset-4 transition hover:opacity-70 disabled:cursor-default disabled:opacity-50"
              >
                {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend"}
              </button>
              <button
                onClick={() => { setView("auth"); setError(null); }}
                className="text-[13px] text-[var(--color-bone-dim)]/80 underline underline-offset-4 transition hover:text-[var(--color-bone-dim)]"
              >
                Back to sign in
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/* ── Rotating product promises ───────────────────────────────────────────── */
function RotatingTestimonial() {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setIdx((i) => (i + 1) % PROMISES.length), 9000);
    return () => clearInterval(id);
  }, []);

  const t = PROMISES[idx]!;

  return (
    <div className="relative flex flex-col gap-4">
      <AnimatePresence mode="wait">
        <motion.div
          key={idx}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="flex flex-col gap-3"
        >
          <p className="font-serif text-[18px] italic leading-[1.7] text-[var(--color-bone)]/80 xl:text-[21px]">
            {t.quote}
          </p>
          <p className="text-[11px] tracking-[0.18em] text-[var(--color-ember)]/70 uppercase">
            {t.label}
          </p>
        </motion.div>
      </AnimatePresence>

      <div className="flex gap-1.5 pt-1">
        {PROMISES.map((_, i) => (
          <button
            key={i}
            onClick={() => setIdx(i)}
            aria-label={`Promise ${i + 1}`}
            className={`h-1 cursor-pointer rounded-full transition-all duration-300 ${
              i === idx ? "w-4 bg-[var(--color-ember)]/60" : "w-1 bg-[var(--color-ember)]/20"
            }`}
          />
        ))}
      </div>
    </div>
  );
}

/* ── Page ────────────────────────────────────────────────────────────────── */
export default function LoginPage() {
  return (
    <div className="flex min-h-dvh w-full bg-[var(--color-ink)] text-[var(--color-bone)]">
      {/* Left panel — brand */}
      <div className="relative hidden flex-1 flex-col justify-between overflow-hidden border-r border-[var(--color-rule)] p-12 lg:flex xl:p-16">
        <div className="pointer-events-none absolute inset-0">
          <div
            className="absolute top-[-20%] left-[-10%] h-[70%] w-[70%] rounded-full opacity-60 blur-[120px]"
            style={{ background: "radial-gradient(closest-side, rgba(194,120,74,0.18), transparent 75%)" }}
          />
          <div
            className="absolute bottom-[-20%] right-[-10%] h-[60%] w-[60%] rounded-full opacity-40 blur-[140px]"
            style={{ background: "radial-gradient(closest-side, rgba(158,116,92,0.14), transparent 75%)" }}
          />
          <div
            className="absolute inset-0 opacity-[0.04]"
            style={{
              backgroundImage: "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 1 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")",
              backgroundSize: "200px 200px",
            }}
          />
        </div>

        <div className="relative z-10">
          <Mark />
        </div>

        <div className="relative z-10 flex flex-col gap-10">
          <BrandOrb />
          <div className="flex max-w-sm flex-col gap-4">
            <h2
              className="font-serif text-[40px] leading-[1.05] tracking-[-0.02em] text-[var(--color-bone)] xl:text-[52px]"
              style={{ fontVariationSettings: "'SOFT' 60, 'opsz' 144" }}
            >
              Speak with them<br />
              <span
                className="italic text-[var(--color-bone)]/75"
                style={{ fontVariationSettings: "'SOFT' 100, 'opsz' 144" }}
              >
                again.
              </span>
            </h2>
            <p className="text-[15px] leading-[1.7] text-[var(--color-bone-dim)]">
              Voice conversations with someone you&apos;ve lost, built from their own recordings.
              Private, careful, and entirely yours.
            </p>
          </div>
        </div>

        <div className="relative z-10">
          <div className="mb-4 h-px w-10 bg-[var(--color-ember)]/30" />
          <RotatingTestimonial />
        </div>
      </div>

      {/* Right panel — form */}
      <div className="flex w-full flex-col items-center justify-center px-6 py-16 lg:w-[480px] lg:shrink-0 xl:w-[520px]">
        <div className="mb-6 flex items-center gap-2 rounded-full border border-[var(--color-rule-strong)] bg-[var(--color-ember)]/[0.06] px-3.5 py-1.5 lg:hidden">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--color-ember)]" aria-hidden />
          <span className="text-[11px] tracking-[0.1em] text-[var(--color-ember)] uppercase">
            Speak with them again
          </span>
        </div>

        <div className="mb-10 lg:hidden">
          <Mark />
        </div>

        <div className="w-full max-w-[360px]">
          <Suspense>
            <AuthForm />
          </Suspense>
        </div>
      </div>
    </div>
  );
}

/* ── Animated brand orb ─────────────────────────────────────────────────── */
function BrandOrb() {
  return (
    <div className="relative h-32 w-32">
      <motion.div
        className="absolute inset-[-40%] rounded-full"
        style={{ background: "radial-gradient(closest-side, var(--orb-glow-lo), transparent 75%)" }}
        animate={{ scale: [1, 1.06, 1], opacity: [0.7, 1, 0.7] }}
        transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
      />
      <div className="absolute inset-[8%] rounded-full border border-[var(--color-rule-strong)]" />
      <motion.div
        className="absolute inset-[24%] rounded-full"
        style={{
          background: "radial-gradient(closest-side, var(--orb-core-mid), var(--orb-core-lo) 50%, transparent 85%)",
          mixBlendMode: "var(--orb-blend)" as never,
        }}
        animate={{ scale: [1, 1.08, 1], opacity: [0.75, 1, 0.75] }}
        transition={{ duration: 5, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
      />
      <div className="pointer-events-none absolute top-[26%] left-[28%] h-[14%] w-[18%] rounded-full bg-[var(--orb-specular)] blur-[8px]" />
    </div>
  );
}

/* ── Spinner ─────────────────────────────────────────────────────────────── */
function Spinner({ dark }: { dark?: boolean }) {
  return (
    <motion.span
      className={`inline-block h-4 w-4 rounded-full border-2 ${
        dark
          ? "border-[var(--color-ink)]/30 border-t-[var(--color-ink)]"
          : "border-[var(--color-bone)]/20 border-t-[var(--color-bone)]"
      }`}
      animate={{ rotate: 360 }}
      transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
    />
  );
}

/* ── Eye icons ───────────────────────────────────────────────────────────── */
function EyeIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

/* ── Apple icon ──────────────────────────────────────────────────────────── */
function AppleIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
    </svg>
  );
}

/* ── Google icon ─────────────────────────────────────────────────────────── */
function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  );
}
