"use client";

import { useState, useEffect, useRef, useSyncExternalStore, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import { Mark } from "@/components/shell/Mark";
import { Input } from "@/components/ui/Field";
import { buttonClasses } from "@/components/ui/buttonClasses";
import { fadeUp, stagger } from "@/lib/motion";

/* ── Product promises for left-panel rotation — each literally true ──────── */
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
  if (m.includes("invalid or has expired") || m.includes("expired"))
    return "That link has expired — try signing in again.";
  if (m.includes("can only request this after") || m.includes("rate"))
    return "Just a moment — wait a few seconds then try again.";
  if (m.includes("invalid format") || m.includes("invalid email"))
    return "That doesn't look like a valid email address.";
  return msg;
}

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
  if (domain === "gmail.com") return { label: "Open Gmail →", url: "https://mail.google.com" };
  if (["outlook.com", "hotmail.com", "live.com"].includes(domain))
    return { label: "Open Outlook →", url: "https://outlook.live.com" };
  if (domain === "yahoo.com") return { label: "Open Yahoo →", url: "https://mail.yahoo.com" };
  return null;
}

/* ── Auth form ───────────────────────────────────────────────────────────── */
function AuthForm() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/people";
  const errorParam = searchParams.get("error");

  const router = useRouter();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loadingEmail, setLoadingEmail] = useState(false);
  const [loadingGoogle, setLoadingGoogle] = useState(false);
  const [loadingApple, setLoadingApple] = useState(false);
  const [code, setCode] = useState("");
  const [verifyingCode, setVerifyingCode] = useState(false);
  const [error, setError] = useState<string | null>(
    errorParam === "auth_failed" ? "Sign-in link expired or already used. Try again." : null,
  );
  // Hydration-safe localStorage read: server snapshot is null, the client
  // snapshot reflects whether a voice already exists on this device (and
  // whose it is) so the page can greet by name.
  const returningName = useSyncExternalStore(subscribeNoop, storedVoiceName, () => null);
  const isReturning = returningName !== null;
  const [resendCooldown, setResendCooldown] = useState(0);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (cooldownRef.current) clearInterval(cooldownRef.current);
    };
  }, []);

  const startCooldown = () => {
    setResendCooldown(60);
    cooldownRef.current = setInterval(() => {
      setResendCooldown((c) => {
        if (c <= 1) {
          clearInterval(cooldownRef.current!);
          return 0;
        }
        return c - 1;
      });
    }, 1000);
  };

  const sendMagicLink = async (emailAddr: string) => {
    const supabase = createClient();
    const { error: err } = await supabase.auth.signInWithOtp({
      email: emailAddr,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${next}` },
    });
    return err;
  };

  const submitEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) return;
    setLoadingEmail(true);
    setError(null);
    const err = await sendMagicLink(trimmed);
    setLoadingEmail(false);
    if (err) setError(friendlyError(err.message));
    else {
      setSent(true);
      startCooldown();
    }
  };

  const resend = async () => {
    if (resendCooldown > 0) return;
    setError(null);
    const err = await sendMagicLink(email.trim().toLowerCase());
    if (err) setError(friendlyError(err.message));
    else startCooldown();
  };

  const signInWithGoogle = async () => {
    setLoadingGoogle(true);
    setError(null);
    const supabase = createClient();
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback?next=${next}` },
    });
    if (err) {
      setError(friendlyError(err.message));
      setLoadingGoogle(false);
    }
  };

  const signInWithApple = async () => {
    setLoadingApple(true);
    setError(null);
    const supabase = createClient();
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider: "apple",
      options: { redirectTo: `${window.location.origin}/auth/callback?next=${next}` },
    });
    if (err) {
      setError(friendlyError(err.message));
      setLoadingApple(false);
    }
  };

  // The code path: no app-switch round trip, no in-app-browser session loss.
  // (Requires the Supabase email template to include {{ .Token }}.)
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

  const provider = sent ? getEmailProvider(email) : null;

  return (
    <motion.div
      initial="hidden"
      animate="enter"
      variants={stagger(0.06)}
      className="flex w-full flex-col gap-6"
    >
      {/* Header — carries the landing promise through, greets returning
          users by the name that matters. */}
      <motion.div variants={fadeUp} className="flex flex-col gap-1.5">
        <h1 className="font-serif text-[28px] leading-tight tracking-[-0.02em] text-[var(--color-bone)] sm:text-[32px]">
          {sent
            ? "Check your inbox"
            : isReturning
              ? returningName
                ? `${returningName} is waiting`
                : "Your voices are waiting"
              : "Welcome"}
        </h1>
        <p className="text-[14px] leading-relaxed text-[var(--color-bone-dim)]">
          {sent
            ? `We sent a code and a sign-in link to ${email}`
            : isReturning
              ? "Sign in to pick up where you left off."
              : "First, an account to keep their voice safe. No password — just your email."}
        </p>
      </motion.div>

      <AnimatePresence mode="wait">
        {sent ? (
          <motion.div
            key="sent"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="flex flex-col gap-5"
          >
            {/* Code entry first — no app-switch, no in-app browser, works
                even when the link opens in the wrong place. */}
            <form onSubmit={(e) => void verifyCode(e)} className="flex flex-col gap-2">
              <label htmlFor="otp" className="text-[11px] tracking-[0.1em] text-[var(--color-bone-dim)] uppercase">
                Enter the 6-digit code
              </label>
              <div className="flex gap-2">
                <Input
                  id="otp"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  placeholder="000000"
                  autoFocus
                  className="h-12 max-w-[180px] text-center tracking-[0.35em]"
                  aria-label="Sign-in code from the email"
                />
                <button
                  type="submit"
                  disabled={verifyingCode || code.length < 6}
                  className={buttonClasses({ variant: "primary", size: "md", className: "h-12 flex-1" })}
                >
                  {verifyingCode ? <Spinner dark /> : "Sign in"}
                </button>
              </div>
            </form>

            <p className="text-[13px] leading-relaxed text-[var(--color-bone-dim)]">
              Or tap the link in the email — either works. Check spam if
              nothing arrives within a minute. The email expires in 1 hour.
            </p>

            {/* Email provider shortcut */}
            {provider && (
              <a
                href={provider.url}
                target="_blank"
                rel="noopener noreferrer"
                className={buttonClasses({ variant: "outline", size: "md", className: "w-full text-[13px]" })}
              >
                {provider.label}
              </a>
            )}

            {error && <p className="text-[13px] text-[var(--color-danger)]" role="alert">{error}</p>}

            {/* The wait is part of the journey — use it to prepare the
                next step instead of leaving a dead end. */}
            <div className="mt-1 rounded-xl border border-[var(--color-rule)] bg-white/[0.02] px-4 py-3.5">
              <p className="text-[11px] tracking-[0.14em] text-[var(--color-ember)] uppercase">
                While you wait
              </p>
              <p className="mt-1.5 text-[13px] leading-[1.65] text-[var(--color-text-secondary)]">
                Find a recording of their voice — a voicemail, a video, a
                voice note. Ninety seconds of them speaking clearly is enough
                to begin.
              </p>
            </div>

            <div className="flex items-center gap-5">
              <button
                onClick={() => void resend()}
                disabled={resendCooldown > 0}
                className="text-[13px] text-[var(--color-ember)] underline underline-offset-4 transition hover:opacity-70 disabled:cursor-default disabled:opacity-50"
              >
                {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend email"}
              </button>
              <button
                onClick={() => { setSent(false); setEmail(""); setCode(""); setError(null); }}
                className="text-[13px] text-[var(--color-bone-dim)]/80 underline underline-offset-4 transition hover:text-[var(--color-bone-dim)]"
              >
                Different email
              </button>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="form"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="flex flex-col gap-4"
          >
            {/* Google */}
            <motion.button
              variants={fadeUp}
              type="button"
              onClick={() => void signInWithGoogle()}
              disabled={loadingGoogle || loadingEmail}
              className={buttonClasses({ variant: "outline", size: "md", className: "h-12 w-full" })}
            >
              {loadingGoogle ? (
                <>
                  <Spinner />
                  <span className="text-[13px] text-[var(--color-bone-dim)]">Redirecting to Google…</span>
                </>
              ) : (
                <>
                  <GoogleIcon />
                  Continue with Google
                </>
              )}
            </motion.button>

            {/* Apple — enabled once the provider is configured in Supabase */}
            {process.env.NEXT_PUBLIC_ENABLE_APPLE_AUTH === "true" ? (
              <motion.button
                variants={fadeUp}
                type="button"
                onClick={() => void signInWithApple()}
                disabled={loadingApple || loadingGoogle || loadingEmail}
                className={buttonClasses({ variant: "outline", size: "md", className: "h-12 w-full" })}
              >
                {loadingApple ? (
                  <Spinner />
                ) : (
                  <>
                    <AppleIcon />
                    Continue with Apple
                  </>
                )}
              </motion.button>
            ) : null}

            {/* Divider */}
            <motion.div variants={fadeUp} className="flex items-center gap-3">
              <div className="h-px flex-1 bg-[var(--color-rule-strong)]" />
              <span className="text-[11px] tracking-[0.12em] text-[var(--color-bone-dim)]/80 uppercase">or</span>
              <div className="h-px flex-1 bg-[var(--color-rule-strong)]" />
            </motion.div>

            {/* Email form */}
            <motion.form variants={fadeUp} onSubmit={(e) => void submitEmail(e)} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="email" className="text-[11px] tracking-[0.1em] text-[var(--color-bone-dim)]/70 uppercase">
                  Email address
                </label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  autoFocus
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  disabled={loadingEmail}
                  className="h-12 disabled:opacity-50"
                />
              </div>

              {error && (
                <p className="text-[13px] text-[var(--color-danger)]">{error}</p>
              )}

              <button
                type="submit"
                disabled={loadingEmail || !email.trim()}
                className={buttonClasses({ variant: "primary", size: "md", className: "h-12 w-full" })}
              >
                {loadingEmail ? <Spinner dark /> : "Send sign-in link"}
              </button>
            </motion.form>

            {/* The whole deal, in one line, before commitment */}
            <motion.p variants={fadeUp} className="text-center text-[12px] leading-[1.6] text-[var(--color-text-secondary)]">
              Free for 7 days — no card taken now. Then £30/month, cancel anytime.
            </motion.p>

            {/* Terms */}
            <motion.p variants={fadeUp} className="text-center text-[11px] leading-relaxed text-[var(--color-text-tertiary)]">
              By continuing you agree to our{" "}
              <a href="/terms" className="underline underline-offset-4 transition hover:text-[var(--color-bone-dim)]/90">Terms</a>{" "}
              and{" "}
              <a href="/privacy" className="underline underline-offset-4 transition hover:text-[var(--color-bone-dim)]/90">Privacy Policy</a>.
            </motion.p>
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
    // Slow enough to read as policy, not marketing carousel.
    const id = setInterval(() => {
      setIdx((i) => (i + 1) % PROMISES.length);
    }, 9000);
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

      {/* Dot indicators */}
      <div className="flex gap-1.5 pt-1">
        {PROMISES.map((_, i) => (
          <button
            key={i}
            onClick={() => setIdx(i)}
            aria-label={`Promise ${i + 1}`}
            className={`h-1 cursor-pointer rounded-full transition-all duration-300 ${i === idx ? "w-4 bg-[var(--color-ember)]/60" : "w-1 bg-[var(--color-ember)]/20"}`}
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
      {/* ── Left panel — brand ────────────────────────────────────────── */}
      <div className="relative hidden flex-1 flex-col justify-between overflow-hidden border-r border-[var(--color-rule)] p-12 lg:flex xl:p-16">
        {/* Atmospheric background */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute top-[-20%] left-[-10%] h-[70%] w-[70%] rounded-full opacity-60 blur-[120px]"
            style={{ background: "radial-gradient(closest-side, rgba(194,120,74,0.18), transparent 75%)" }} />
          <div className="absolute bottom-[-20%] right-[-10%] h-[60%] w-[60%] rounded-full opacity-40 blur-[140px]"
            style={{ background: "radial-gradient(closest-side, rgba(158,116,92,0.14), transparent 75%)" }} />
          <div className="absolute inset-0 opacity-[0.04]"
            style={{ backgroundImage: "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 1 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")", backgroundSize: "200px 200px" }} />
        </div>

        {/* Top: logo */}
        <div className="relative z-10">
          <Mark />
        </div>

        {/* Centre: orb + headline */}
        <div className="relative z-10 flex flex-col gap-10">
          <BrandOrb />
          <div className="flex flex-col gap-4 max-w-sm">
            <h2 className="font-serif text-[40px] leading-[1.05] tracking-[-0.02em] text-[var(--color-bone)] xl:text-[52px]"
              style={{ fontVariationSettings: "'SOFT' 60, 'opsz' 144" }}>
              Speak with them<br />
              <span className="italic text-[var(--color-bone)]/75"
                style={{ fontVariationSettings: "'SOFT' 100, 'opsz' 144" }}>
                again.
              </span>
            </h2>
            <p className="text-[15px] leading-[1.7] text-[var(--color-bone-dim)]">
              Voice conversations with someone you&apos;ve lost, built from their own recordings. Private, careful, and entirely yours.
            </p>
          </div>
        </div>

        {/* Bottom: rotating testimonial */}
        <div className="relative z-10">
          <div className="mb-4 h-px w-10 bg-[var(--color-ember)]/30" />
          <RotatingTestimonial />
        </div>
      </div>

      {/* ── Right panel — auth form ───────────────────────────────────── */}
      <div className="flex w-full flex-col items-center justify-center px-6 py-16 lg:w-[480px] lg:shrink-0 xl:w-[520px]">
        {/* Mobile: brand context pill */}
        <div className="mb-6 flex items-center gap-2 rounded-full border border-[var(--color-rule-strong)] bg-[var(--color-ember)]/[0.06] px-3.5 py-1.5 lg:hidden">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--color-ember)]" aria-hidden />
          <span className="text-[11px] tracking-[0.1em] text-[var(--color-ember)] uppercase">Speak with them again</span>
        </div>

        {/* Mobile: logo */}
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
      className={`inline-block h-4 w-4 rounded-full border-2 ${dark ? "border-[var(--color-ink)]/30 border-t-[var(--color-ink)]" : "border-[var(--color-bone)]/20 border-t-[var(--color-bone)]"}`}
      animate={{ rotate: 360 }}
      transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
    />
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
