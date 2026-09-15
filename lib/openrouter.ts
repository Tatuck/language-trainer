import OpenAI from "openai";
import { MISSING_KEY_MESSAGE } from "./llm/errors";

export const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

/** Sent as `HTTP-Referer` so the calls show up under this app on the OpenRouter dashboard. */
export const SITE_URL = "https://tatuck.github.io/language-trainer";

/** Per-request ceiling (ms): a 60 s audio clip plus model latency fits comfortably; hung upstreams do not. */
export const REQUEST_TIMEOUT_MS = 60_000;

/** The subset of the SDK the app calls; lets tests pass a fake without building a whole client. */
export type ChatClient = Pick<OpenAI, "chat">;

/**
 * OpenRouter speaks the OpenAI chat-completions protocol; the official SDK works with a base URL swap.
 * Built in the browser with the learner's own key (there is no server to hold one).
 */
export function createClient(apiKey: string): OpenAI {
  const key = apiKey.trim();
  if (!key) throw new Error(MISSING_KEY_MESSAGE);
  return new OpenAI({
    apiKey: key,
    baseURL: OPENROUTER_BASE_URL,
    timeout: REQUEST_TIMEOUT_MS,
    maxRetries: 1,
    dangerouslyAllowBrowser: true,
    defaultHeaders: { "X-Title": "LanguageTrainer", "HTTP-Referer": SITE_URL },
  });
}

export type KeyInfo = {
  /** OpenRouter's name for the key (usually its masked prefix). */
  label: string | null;
  /** Dollars spent so far, when reported. */
  usage: number | null;
  /** Dollar cap set on the key, when any. */
  limit: number | null;
};

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Asks OpenRouter about the key; rejects with a readable message when it is invalid or unreachable. */
export async function checkApiKey(apiKey: string, signal?: AbortSignal): Promise<KeyInfo> {
  const key = apiKey.trim();
  if (!key) throw new Error(MISSING_KEY_MESSAGE);
  const res = await fetch(`${OPENROUTER_BASE_URL}/auth/key`, {
    headers: { Authorization: `Bearer ${key}` },
    signal,
  });
  if (res.status === 401 || res.status === 403) throw new Error("OpenRouter rejected this key.");
  if (!res.ok) throw new Error(`OpenRouter answered ${res.status}${res.statusText ? ` ${res.statusText}` : ""}.`);
  const json: unknown = await res.json();
  const data = typeof json === "object" && json !== null ? (json as { data?: unknown }).data : undefined;
  const o = typeof data === "object" && data !== null ? (data as Record<string, unknown>) : {};
  return {
    label: typeof o.label === "string" ? o.label : null,
    usage: numberOrNull(o.usage),
    limit: numberOrNull(o.limit),
  };
}
