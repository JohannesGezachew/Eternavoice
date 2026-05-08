import "server-only";
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { env } from "./env";

let cached: ElevenLabsClient | null = null;

export function elevenlabs(): ElevenLabsClient {
  if (!cached) {
    cached = new ElevenLabsClient({ apiKey: env.ELEVENLABS_API_KEY });
  }
  return cached;
}

export const VOICE_SETTINGS = {
  stability: 0.5,
  similarityBoost: 0.85,
  style: 0.3,
  useSpeakerBoost: true,
} as const;
