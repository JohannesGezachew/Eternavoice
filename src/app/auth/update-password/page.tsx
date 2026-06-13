"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import { Mark } from "@/components/shell/Mark";
import { Input } from "@/components/ui/Field";
import { buttonClasses } from "@/components/ui/buttonClasses";
import { fadeUp, stagger } from "@/lib/motion";

function friendlyError(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes("password should be at least"))
    return "Password must be at least 8 characters.";
  if (m.includes("same password") || m.includes("different from the old"))
    return "New password must be different from your current one.";
  if (m.includes("session") || m.includes("not authenticated") || m.includes("jwt"))
    return "This link has expired. Request a new one from the sign-in page.";
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

export default function UpdatePasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const strength = password ? passwordStrength(password) : null;
  const matches = confirmPassword ? password === confirmPassword : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error: err } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (err) {
      setError(friendlyError(err.message));
    } else {
      setDone(true);
      setTimeout(() => router.push("/people"), 2000);
    }
  };

  return (
    <div className="flex min-h-dvh w-full bg-[var(--color-ink)] text-[var(--color-bone)]">
      {/* Atmospheric background */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div
          className="absolute top-[-20%] left-[-10%] h-[60%] w-[60%] rounded-full opacity-40 blur-[120px]"
          style={{ background: "radial-gradient(closest-side, rgba(194,120,74,0.15), transparent 75%)" }}
        />
        <div
          className="absolute bottom-[-20%] right-[-10%] h-[50%] w-[50%] rounded-full opacity-30 blur-[140px]"
          style={{ background: "radial-gradient(closest-side, rgba(111,148,134,0.12), transparent 75%)" }}
        />
      </div>

      <div className="relative flex w-full items-center justify-center px-6 py-16">
        <motion.div
          initial="hidden"
          animate="enter"
          variants={stagger(0.07)}
          className="flex w-full max-w-[380px] flex-col gap-7"
        >
          {/* Logo */}
          <motion.div variants={fadeUp}>
            <Mark />
          </motion.div>

          {/* Heading */}
          <motion.div variants={fadeUp} className="flex flex-col gap-1.5">
            <AnimatePresence mode="wait">
              <motion.h1
                key={done ? "done" : "form"}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.25 }}
                className="font-serif text-[28px] leading-tight tracking-[-0.02em] sm:text-[32px]"
              >
                {done ? "Password updated" : "Set a new password"}
              </motion.h1>
            </AnimatePresence>
            <p className="text-[14px] leading-relaxed text-[var(--color-bone-dim)]">
              {done
                ? "Taking you to your voices…"
                : "Choose something secure you'll remember."}
            </p>
          </motion.div>

          {/* Form */}
          <AnimatePresence mode="wait">
            {!done && (
              <motion.form
                key="form"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.3 }}
                onSubmit={(e) => void handleSubmit(e)}
                className="flex flex-col gap-4"
              >
                {/* New password */}
                <div className="flex flex-col gap-1.5">
                  <label
                    htmlFor="new-password"
                    className="text-[11px] tracking-[0.1em] text-[var(--color-bone-dim)]/70 uppercase"
                  >
                    New password
                  </label>
                  <div className="relative">
                    <Input
                      id="new-password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="new-password"
                      autoFocus
                      required
                      minLength={8}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
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

                  {/* Strength meter */}
                  <AnimatePresence>
                    {strength && (
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

                {/* Confirm password */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <label
                      htmlFor="confirm-password"
                      className="text-[11px] tracking-[0.1em] text-[var(--color-bone-dim)]/70 uppercase"
                    >
                      Confirm password
                    </label>
                    {matches === false && confirmPassword.length >= 4 && (
                      <span className="text-[11px] text-[var(--color-danger)]">
                        Doesn&apos;t match
                      </span>
                    )}
                    {matches === true && (
                      <span className="text-[11px] text-emerald-400">Matches</span>
                    )}
                  </div>
                  <div className="relative">
                    <Input
                      id="confirm-password"
                      type={showConfirm ? "text" : "password"}
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
                      onClick={() => setShowConfirm((v) => !v)}
                      tabIndex={-1}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[var(--color-bone-dim)]/40 transition hover:text-[var(--color-bone-dim)]"
                      aria-label={showConfirm ? "Hide password" : "Show password"}
                    >
                      {showConfirm ? <EyeOffIcon /> : <EyeIcon />}
                    </button>
                  </div>
                </div>

                {error && (
                  <div className="flex flex-col gap-2">
                    <p className="text-[13px] text-[var(--color-danger)]" role="alert">
                      {error}
                    </p>
                    {error.includes("expired") && (
                      <a
                        href="/auth/login"
                        className="text-[13px] text-[var(--color-ember)] underline underline-offset-4 transition hover:opacity-80"
                      >
                        Request a new reset link →
                      </a>
                    )}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading || !password || !confirmPassword}
                  className={buttonClasses({
                    variant: "primary",
                    size: "md",
                    className: "mt-1 h-12 w-full",
                  })}
                >
                  {loading ? <Spinner dark /> : "Update password"}
                </button>

                <p className="text-center text-[12px] text-[var(--color-text-tertiary)]">
                  Remember it now?{" "}
                  <a
                    href="/auth/login"
                    className="underline underline-offset-4 transition hover:text-[var(--color-bone-dim)]"
                  >
                    Sign in instead
                  </a>
                </p>
              </motion.form>
            )}

            {/* Done state */}
            {done && (
              <motion.div
                key="done"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                className="flex items-center gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] px-4 py-3.5"
              >
                <CheckIcon />
                <p className="text-[13px] text-emerald-300">
                  Your password has been updated successfully.
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </div>
  );
}

/* ── Icons ───────────────────────────────────────────────────────────────── */
function EyeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-emerald-400" aria-hidden>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

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
