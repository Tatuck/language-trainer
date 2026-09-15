"use client";

import { useMemo, useSyncExternalStore } from "react";
import { SETTINGS_KEY, loadSettings, type Settings } from "./settings";

function subscribe(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

/** The raw stored string is the snapshot: compared by value, so unchanged storage means no re-render. */
function getSnapshot(): string {
  try {
    return localStorage.getItem(SETTINGS_KEY) ?? "";
  } catch {
    return "";
  }
}

function getServerSnapshot(): null {
  return null;
}

/**
 * Stored settings, or null while rendering on the server and during hydration (storage is
 * browser-only, and the static shell must match the first client paint).
 */
export function useStoredSettings(): Settings | null {
  const raw = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return useMemo(() => (raw === null ? null : loadSettings()), [raw]);
}
