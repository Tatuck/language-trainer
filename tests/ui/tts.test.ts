import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  TTS_STORAGE_KEY,
  isTtsSupported,
  pickEnglishVoice,
  readTtsPreference,
  speak,
  stopSpeaking,
  ttsStore,
} from "@/lib/tts";

function voice(lang: string, name: string, isDefault = false): SpeechSynthesisVoice {
  return { lang, name, default: isDefault, localService: true, voiceURI: name } as SpeechSynthesisVoice;
}

function fakeSynth() {
  const synth = {
    cancel: vi.fn(),
    speak: vi.fn(),
    getVoices: vi.fn(() => [voice("es-ES", "Monica"), voice("en-GB", "Daniel"), voice("en-US", "Samantha", true)]),
  };
  vi.stubGlobal("speechSynthesis", synth);
  vi.stubGlobal(
    "SpeechSynthesisUtterance",
    class {
      text: string;
      lang = "";
      rate = 1;
      voice: SpeechSynthesisVoice | null = null;
      constructor(text: string) {
        this.text = text;
      }
    }
  );
  return synth;
}

function fakeStorage() {
  const data = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  });
  return data;
}

beforeEach(() => {
  vi.stubGlobal("window", {});
});
afterEach(() => vi.unstubAllEnvs());
afterEach(() => vi.unstubAllGlobals());

describe("isTtsSupported", () => {
  it("is false without window or speechSynthesis", () => {
    vi.stubGlobal("window", undefined);
    expect(isTtsSupported()).toBe(false);
    vi.stubGlobal("window", {});
    expect(isTtsSupported()).toBe(false);
  });

  it("is true when window.speechSynthesis exists", () => {
    vi.stubGlobal("window", { speechSynthesis: {} });
    expect(isTtsSupported()).toBe(true);
  });
});

describe("pickEnglishVoice", () => {
  it("prefers the default English voice, then any English voice, else null", () => {
    expect(pickEnglishVoice([voice("es-ES", "Monica"), voice("en-GB", "Daniel"), voice("en-US", "Samantha", true)])?.name).toBe("Samantha");
    expect(pickEnglishVoice([voice("es-ES", "Monica"), voice("en-GB", "Daniel")])?.name).toBe("Daniel");
    expect(pickEnglishVoice([voice("es-ES", "Monica", true)])).toBeNull();
    expect(pickEnglishVoice([])).toBeNull();
  });
});

describe("speak / stopSpeaking", () => {
  it("cancels anything in progress, then speaks the text in English with an English voice", () => {
    const synth = fakeSynth();
    speak("Hello there.");
    expect(synth.cancel).toHaveBeenCalledTimes(1);
    expect(synth.speak).toHaveBeenCalledTimes(1);
    const u = synth.speak.mock.calls[0][0] as { text: string; lang: string; voice: SpeechSynthesisVoice | null; rate: number };
    expect(u.text).toBe("Hello there.");
    expect(u.lang).toBe("en-US");
    expect(u.voice?.name).toBe("Samantha");
    expect(u.rate).toBeLessThan(1);
  });

  it("does nothing for empty text or when unsupported", () => {
    const synth = fakeSynth();
    speak("   ");
    expect(synth.speak).not.toHaveBeenCalled();
    vi.stubGlobal("speechSynthesis", undefined);
    expect(() => speak("Hi")).not.toThrow();
  });

  it("stopSpeaking cancels and is safe when unsupported", () => {
    const synth = fakeSynth();
    stopSpeaking();
    expect(synth.cancel).toHaveBeenCalledTimes(1);
    vi.stubGlobal("speechSynthesis", undefined);
    expect(() => stopSpeaking()).not.toThrow();
  });
});

describe("preference store", () => {
  it("defaults to off and survives a broken localStorage", () => {
    vi.stubGlobal("localStorage", undefined);
    expect(readTtsPreference()).toBe(false);
  });

  it("persists the preference and notifies subscribers", () => {
    const data = fakeStorage();
    const listener = vi.fn();
    const unsubscribe = ttsStore.subscribe(listener);
    ttsStore.set(true);
    expect(ttsStore.get()).toBe(true);
    expect(data.get(TTS_STORAGE_KEY)).toBe("1");
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    ttsStore.set(false);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(readTtsPreference()).toBe(false);
  });
});
