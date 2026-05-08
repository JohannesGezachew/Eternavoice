import "server-only";
import OpenAI from "openai";
import { env } from "./env";

let cached: OpenAI | null = null;

export function openai(): OpenAI {
  if (!cached) {
    cached = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  }
  return cached;
}
