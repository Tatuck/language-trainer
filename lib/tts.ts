"use client";

import { useSyncExternalStore } from "react";

export const TTS_STORAGE_KEY = "lt:tts:v1";

export function isTtsSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

function synth(): SpeechSynthesis | null {
  return typeof speechSynthesis === "undefined" ? null : speechSynthesis;
}

/** The default English voice if the browser has one, else the first English voice, else null. */
export function pickEnglishVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  const english = voices.filter((v) => v.lang.toLowerCase().startsWith("en"));
  return english.find((v) => v.default) ?? english[0] ?? null;
}

/** Reads the text aloud in English, replacing anything still being spoken. */
export function speak(text: string): void {
  const s = synth();
  const trimmed = text.trim();
  if (!s || trimmed.length === 0) return;
  s.cancel();
  const utterance = new SpeechSynthesisUtterance(trimmed);
  utterance.lang = "en-US";
  utterance.rate = 0.95;
  utterance.voice = pickEnglishVoice(s.getVoices());
  s.speak(utterance);
}

export function stopSpeaking(): void {
  synth()?.cancel();
}

export function readTtsPreference(): boolean {
  try {
    return localStorage.getItem(TTS_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function writeTtsPreference(on: boolean): void {
  try {
    if (on) localStorage.setItem(TTS_STORAGE_KEY, "1");
    else localStorage.removeItem(TTS_STORAGE_KEY);
  } catch (err) {
    console.warn("Could not persist the read-aloud preference", err);
  }
}

const listeners = new Set<() => void>();

/** Tiny external store so components can subscribe to the preference without setState-in-effect. */
export const ttsStore = {
  get: readTtsPreference,
  set(on: boolean): void {
    writeTtsPreference(on);
    if (!on) stopSpeaking();
    listeners.forEach((l) => l());
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

const serverSnapshot = () => false;

export function useTtsEnabled(): [boolean, (on: boolean) => void] {
  const enabled = useSyncExternalStore(ttsStore.subscribe, ttsStore.get, serverSnapshot);
  return [enabled, ttsStore.set];
}

const noopSubscribe = () => () => {};

/** False during SSR and hydration, then the real capability — avoids a hydration mismatch. */
export function useTtsSupported(): boolean {
  return useSyncExternalStore(noopSubscribe, isTtsSupported, serverSnapshot);
}
