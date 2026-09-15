"use client";

import { useSyncExternalStore } from "react";

export const THEME_STORAGE_KEY = "lt:theme:v1";

export const THEMES = ["system", "light", "dark"] as const;
export type Theme = (typeof THEMES)[number];
export type ResolvedTheme = "light" | "dark";

const DARK_QUERY = "(prefers-color-scheme: dark)";

export function parseTheme(value: unknown): Theme {
  return value === "light" || value === "dark" ? value : "system";
}

export function readTheme(): Theme {
  try {
    return parseTheme(localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return "system";
  }
}

function writeTheme(theme: Theme): void {
  try {
    if (theme === "system") localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch (err) {
    console.warn("Could not persist the theme preference", err);
  }
}

export function resolveTheme(theme: Theme, prefersDark: boolean): ResolvedTheme {
  if (theme === "system") return prefersDark ? "dark" : "light";
  return theme;
}

export function systemPrefersDark(): boolean {
  return typeof matchMedia !== "undefined" && matchMedia(DARK_QUERY).matches;
}

/** Stamps `data-theme` on <html>; Tailwind's `dark:` variant keys on it (see globals.css). */
export function applyTheme(theme: Theme): void {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.theme = resolveTheme(theme, systemPrefersDark());
}

/**
 * Runs inline in <head> before the first paint so a stored preference never flashes the other
 * theme. Same resolution as `applyTheme`; keep the two in sync.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});var d=t==="dark"||(t!=="light"&&matchMedia(${JSON.stringify(DARK_QUERY)}).matches);document.documentElement.dataset.theme=d?"dark":"light"}catch(e){}})()`;

const listeners = new Set<() => void>();

/** Tiny external store so components can subscribe to the preference without setState-in-effect. */
export const themeStore = {
  get: readTheme,
  set(theme: Theme): void {
    writeTheme(theme);
    applyTheme(theme);
    listeners.forEach((l) => l());
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

const serverSnapshot = (): Theme => "system";

export function useTheme(): [Theme, (theme: Theme) => void] {
  const theme = useSyncExternalStore(themeStore.subscribe, themeStore.get, serverSnapshot);
  return [theme, themeStore.set];
}

/** Re-applies the theme when the OS preference changes (only matters while following the system). */
export function watchSystemTheme(): () => void {
  if (typeof matchMedia === "undefined") return () => {};
  const query = matchMedia(DARK_QUERY);
  const onChange = () => applyTheme(readTheme());
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}
