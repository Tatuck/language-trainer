import OpenAI from "openai";

export const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
export const DEFAULT_MODEL = "meta/muse-spark-1.3";

export type Models = { chat: string; audio: string };

/** Chat model from OPENROUTER_MODEL; audio model from OPENROUTER_AUDIO_MODEL, else same as chat. */
export function resolveModels(): Models {
  const chat = process.env.OPENROUTER_MODEL?.trim() || DEFAULT_MODEL;
  const audio = process.env.OPENROUTER_AUDIO_MODEL?.trim() || chat;
  return { chat, audio };
}

/** OpenRouter speaks the OpenAI chat-completions protocol; the official SDK works with a base URL swap. */
export function createClient(): OpenAI {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is not set. Copy .env.example to .env.local and fill it in.");
  }
  return new OpenAI({
    apiKey,
    baseURL: OPENROUTER_BASE_URL,
    defaultHeaders: { "X-Title": "LanguageTrainer" },
  });
}
