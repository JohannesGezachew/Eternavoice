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
  STRIPE_PRICE_ID: optional("STRIPE_PRICE_ID", ""),
};
