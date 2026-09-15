import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_AUDIO_MODEL,
  DEFAULT_CHAT_MODEL,
  DEFAULT_SETTINGS,
  SETTINGS_KEY,
  hasApiKey,
  loadSettings,
  modelsFrom,
  normaliseSettings,
  saveSettings,
} from "@/lib/settings";

function fakeStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    map,
    getItem: vi.fn((k: string) => map.get(k) ?? null),
    setItem: vi.fn((k: string, v: string) => {
      map.set(k, v);
    }),
    removeItem: vi.fn((k: string) => {
      map.delete(k);
    }),
  };
}

describe("normaliseSettings", () => {
  it("trims strings and fills blanks with the defaults", () => {
    expect(normaliseSettings({ apiKey: " sk-or-x ", chatModel: "  ", audioModel: "a/b " })).toEqual({
      apiKey: "sk-or-x",
      chatModel: DEFAULT_CHAT_MODEL,
      audioModel: "a/b",
    });
  });

  it("returns the defaults for junk", () => {
    for (const junk of [null, 42, "x", [], { apiKey: 7 }]) {
      expect(normaliseSettings(junk)).toEqual(DEFAULT_SETTINGS);
    }
  });
});

describe("loadSettings / saveSettings", () => {
  let warn: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("uses the defaults when localStorage is unavailable, and save throws", () => {
    vi.stubGlobal("localStorage", undefined);
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
    expect(() => saveSettings(DEFAULT_SETTINGS)).toThrow(/local storage/);
  });

  it("round-trips normalised settings under the versioned key", () => {
    const storage = fakeStorage();
    vi.stubGlobal("localStorage", storage);
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
    const saved = saveSettings({ apiKey: " sk-or-x ", chatModel: "", audioModel: "g/f" });
    expect(saved).toEqual({ apiKey: "sk-or-x", chatModel: DEFAULT_CHAT_MODEL, audioModel: "g/f" });
    expect(JSON.parse(storage.map.get(SETTINGS_KEY) as string)).toEqual(saved);
    expect(loadSettings()).toEqual(saved);
    expect(warn).not.toHaveBeenCalled();
  });

  it("falls back to the defaults with one warning when the stored value is broken", () => {
    const storage = fakeStorage({ [SETTINGS_KEY]: "{not json" });
    vi.stubGlobal("localStorage", storage);
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("falls back to the defaults when reading storage throws (private mode)", () => {
    const storage = fakeStorage();
    storage.getItem.mockImplementation(() => {
      throw new Error("SecurityError");
    });
    vi.stubGlobal("localStorage", storage);
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe("hasApiKey / modelsFrom", () => {
  it("reports whether a key is set", () => {
    expect(hasApiKey(DEFAULT_SETTINGS)).toBe(false);
    expect(hasApiKey({ ...DEFAULT_SETTINGS, apiKey: "sk-or-x" })).toBe(true);
  });

  it("maps the two model fields", () => {
    expect(modelsFrom({ apiKey: "", chatModel: "c", audioModel: "a" })).toEqual({ chat: "c", audio: "a" });
    expect(modelsFrom(DEFAULT_SETTINGS)).toEqual({ chat: DEFAULT_CHAT_MODEL, audio: DEFAULT_AUDIO_MODEL });
  });
});
