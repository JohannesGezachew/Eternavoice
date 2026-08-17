import "server-only";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}. Set it in .env.local.`,
    );
  }
  return value;
}

function optional(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

export const env = {
  get OPENAI_API_KEY() {
    return required("OPENAI_API_KEY");
  },
  get ELEVENLABS_API_KEY() {
    return required("ELEVENLABS_API_KEY");
  },
  OPENAI_CHAT_MODEL: optional("OPENAI_CHAT_MODEL", "gpt-4o"),
  OPENAI_TRANSCRIBE_MODEL: optional("OPENAI_TRANSCRIBE_MODEL", "gpt-4o-mini-transcribe"),
  ELEVENLABS_TTS_MODEL: optional("ELEVENLABS_TTS_MODEL", "eleven_turbo_v2_5"),
  ELEVENLABS_FALLBACK_TTS_MODEL: optional(
    "ELEVENLABS_FALLBACK_TTS_MODEL",
    "eleven_flash_v2_5",
  ),
  get SUPABASE_SERVICE_ROLE_KEY() {
    return required("SUPABASE_SERVICE_ROLE_KEY");
  },
  get MASTER_ENCRYPTION_KEY() {
    return required("MASTER_ENCRYPTION_KEY");
  },
  get STRIPE_SECRET_KEY() {
    return required("STRIPE_SECRET_KEY");
  },
  get STRIPE_WEBHOOK_SECRET() {
    return required("STRIPE_WEBHOOK_SECRET");
  },
  // Required: an empty price id makes Stripe reject every checkout session, so
  // an unset value would break subscriptions in production only.
  get STRIPE_PRICE_ID() {
    return required("STRIPE_PRICE_ID");
  },
};

/**
 * The Supabase URL and anon key, checked rather than asserted.
 *
 * Both were read as `process.env.X!` at half a dozen call sites. A missing
 * value therefore reached the Supabase client as the string "undefined", which
 * fails as a DNS error deep inside a request — so a misconfigured deployment
 * looked like an outage rather than a missing variable.
 */
export function supabaseUrl(): string {
  return required("NEXT_PUBLIC_SUPABASE_URL");
}

export function supabaseAnonKey(): string {
  return required("NEXT_PUBLIC_SUPABASE_ANON_KEY");
}

/**
 * Every server-side variable, checked once at boot.
 *
 * Each of these was validated lazily, at the moment it was first needed —
 * which for MASTER_ENCRYPTION_KEY means the first field anyone tried to
 * encrypt. A key of the wrong length was therefore not a startup failure but a
 * failed save, in production, in the middle of someone's conversation. Called
 * from instrumentation.ts, so the process refuses to come up instead.
 */
export function validateServerEnv(): void {
  const problems: string[] = [];

  for (const name of [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "OPENAI_API_KEY",
    "ELEVENLABS_API_KEY",
    "MASTER_ENCRYPTION_KEY",
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "STRIPE_PRICE_ID",
  ]) {
    if (!process.env[name]) problems.push(`${name} is not set`);
  }

  const master = process.env.MASTER_ENCRYPTION_KEY;
  if (master && Buffer.from(master, "base64").byteLength !== 32) {
    problems.push(
      "MASTER_ENCRYPTION_KEY must decode to exactly 32 bytes (base64). " +
        "Every encrypted field in the database depends on it.",
    );
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (url && !/^https?:\/\//.test(url)) {
    problems.push("NEXT_PUBLIC_SUPABASE_URL must be a full URL including https://");
  }

  if (problems.length) {
    throw new Error(
      `Environment is not usable:\n  - ${problems.join("\n  - ")}\n` +
        "Set these in .env.local (locally) or the deployment's environment.",
    );
  }
}
