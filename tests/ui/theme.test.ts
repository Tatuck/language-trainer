import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  THEME_INIT_SCRIPT,
  THEME_STORAGE_KEY,
  applyTheme,
  parseTheme,
  readTheme,
  resolveTheme,
  themeStore,
  watchSystemTheme,
} from "@/lib/theme";

function fakeStorage() {
  const map = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
    removeItem: (k: string) => {
      map.delete(k);
    },
  });
  return map;
}

function fakeDom(prefersDark: boolean) {
  const dataset: Record<string, string> = {};
  const listeners = new Set<() => void>();
  vi.stubGlobal("document", { documentElement: { dataset } });
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query.includes("dark") && prefersDark,
    addEventListener: (_: string, l: () => void) => listeners.add(l),
    removeEventListener: (_: string, l: () => void) => listeners.delete(l),
  }));
  return { dataset, listeners };
}

describe("parseTheme / resolveTheme", () => {
  it("accepts light and dark, everything else means system", () => {
    expect(parseTheme("light")).toBe("light");
    expect(parseTheme("dark")).toBe("dark");
    for (const junk of [null, "", "auto", 1, {}]) expect(parseTheme(junk)).toBe("system");
  });

  it("resolves system from the OS preference and fixed themes as they are", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });
});

describe("themeStore", () => {
  let map: Map<string, string>;
  beforeEach(() => {
    map = fakeStorage();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("reads system when nothing is stored or storage throws", () => {
    expect(readTheme()).toBe("system");
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("SecurityError");
      },
    });
    expect(readTheme()).toBe("system");
  });

  it("persists fixed themes, removes the key for system, stamps <html> and notifies", () => {
    const { dataset } = fakeDom(true);
    const listener = vi.fn();
    const unsubscribe = themeStore.subscribe(listener);
    themeStore.set("light");
    expect(map.get(THEME_STORAGE_KEY)).toBe("light");
    expect(dataset.theme).toBe("light");
    expect(themeStore.get()).toBe("light");
    themeStore.set("system");
    expect(map.has(THEME_STORAGE_KEY)).toBe(false);
    expect(dataset.theme).toBe("dark");
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    themeStore.set("dark");
    expect(listener).toHaveBeenCalledTimes(2);
    expect(dataset.theme).toBe("dark");
  });

  it("applyTheme is a no-op without a document", () => {
    expect(() => applyTheme("dark")).not.toThrow();
  });

  it("watchSystemTheme re-applies the stored theme when the OS preference changes", () => {
    const { dataset, listeners } = fakeDom(false);
    const stop = watchSystemTheme();
    expect(listeners.size).toBe(1);
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    listeners.forEach((l) => l());
    expect(dataset.theme).toBe("dark");
    stop();
  });
});

describe("THEME_INIT_SCRIPT", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("resolves the same way as applyTheme, before hydration", () => {
    const map = fakeStorage();
    const { dataset } = fakeDom(true);
    const run = () => new Function(THEME_INIT_SCRIPT)();
    run();
    expect(dataset.theme).toBe("dark");
    map.set(THEME_STORAGE_KEY, "light");
    run();
    expect(dataset.theme).toBe("light");
  });

  it("swallows errors when storage is unavailable", () => {
    vi.stubGlobal("localStorage", undefined);
    fakeDom(false);
    expect(() => new Function(THEME_INIT_SCRIPT)()).not.toThrow();
  });
});
