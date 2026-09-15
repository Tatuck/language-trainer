/**
 * Learner settings kept in this browser's localStorage: the OpenRouter key and the two model ids.
 * There is no server; the key is sent straight to openrouter.ai and nowhere else.
 */

export const SETTINGS_KEY = "lt:settings:v1";

export const DEFAULT_CHAT_MODEL = "google/gemini-3.8-flash";
export const DEFAULT_AUDIO_MODEL = "google/gemini-3.8-flash";

/** Shown as `<datalist>` hints on the settings page; any OpenRouter model id is accepted. */
export const MODEL_SUGGESTIONS = [
  "google/gemini-3.8-flash",
  "google/gemini-3.8-pro",
  "meta/muse-spark-1.3",
  "openai/gpt-5.5-mini",
  "anthropic/claude-sonnet-5",
] as const;

export type Settings = {
  apiKey: string;
  /** Tutor replies. */
  chatModel: string;
  /** Transcription + analysis; must accept `input_audio`. */
  audioModel: string;
};

export type Models = { chat: string; audio: string };

export const DEFAULT_SETTINGS: Settings = {
  apiKey: "",
  chatModel: DEFAULT_CHAT_MODEL,
  audioModel: DEFAULT_AUDIO_MODEL,
};

function stringField(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Settings from any stored value: strings trimmed, blanks replaced by defaults, junk ignored. */
export function normaliseSettings(value: unknown): Settings {
  if (typeof value !== "object" || value === null) return { ...DEFAULT_SETTINGS };
  const o = value as Record<string, unknown>;
  return {
    apiKey: stringField(o.apiKey),
    chatModel: stringField(o.chatModel) || DEFAULT_CHAT_MODEL,
    audioModel: stringField(o.audioModel) || DEFAULT_AUDIO_MODEL,
  };
}

function storage(): Storage | null {
  if (typeof localStorage === "undefined" || localStorage === null) return null;
  return localStorage;
}

/** Stored settings, or the defaults when storage is unavailable, empty or unreadable. */
export function loadSettings(): Settings {
  const s = storage();
  if (!s) return { ...DEFAULT_SETTINGS };
  let raw: string | null;
  try {
    raw = s.getItem(SETTINGS_KEY);
  } catch (err) {
    console.warn("[settings] localStorage read failed; using defaults.", err);
    return { ...DEFAULT_SETTINGS };
  }
  if (raw === null) return { ...DEFAULT_SETTINGS };
  try {
    return normaliseSettings(JSON.parse(raw));
  } catch (err) {
    console.warn("[settings] stored settings are not JSON; using defaults.", err);
    return { ...DEFAULT_SETTINGS };
  }
}

/** Persist normalised settings; throws when this browser offers no localStorage. */
export function saveSettings(settings: Settings): Settings {
  const s = storage();
  if (!s) throw new Error("This browser has no local storage, so settings cannot be saved.");
  const normalised = normaliseSettings(settings);
  s.setItem(SETTINGS_KEY, JSON.stringify(normalised));
  return normalised;
}

export function hasApiKey(settings: Settings): boolean {
  return settings.apiKey.length > 0;
}

export function modelsFrom(settings: Settings): Models {
  return { chat: settings.chatModel, audio: settings.audioModel };
}
