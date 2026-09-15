import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { INTERRUPTED_ANALYSIS } from "@/lib/session-normalise";
import {
  STORAGE_KEY,
  createSession,
  deleteSession,
  loadAllSessions,
  loadSession,
  loadSessions,
  saveSession,
} from "@/lib/store";
import type { Session } from "@/lib/types";

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

const base: Session = {
  id: "s1",
  topic: "Travel",
  level: "B1",
  lang: "es",
  createdAt: "2026-09-14T08:00:00.000Z",
  turns: [],
};

function stored(storage: ReturnType<typeof fakeStorage>): unknown[] {
  return JSON.parse(storage.map.get(STORAGE_KEY) ?? "[]") as unknown[];
}

describe("store (localStorage)", () => {
  let storage: ReturnType<typeof fakeStorage>;
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    storage = fakeStorage();
    vi.stubGlobal("localStorage", storage);
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("keeps the key of the original localStorage store, so old sessions load as they are", () => {
    expect(STORAGE_KEY).toBe("lt:sessions:v1");
  });

  it("starts empty and answers null for unknown ids", async () => {
    await expect(loadSessions()).resolves.toEqual([]);
    await expect(loadAllSessions()).resolves.toEqual([]);
    await expect(loadSession("nope")).resolves.toBeNull();
  });

  it("saveSession upserts by id and loadSession returns the stored session", async () => {
    await saveSession(base);
    await saveSession({ ...base, topic: "Food" });
    expect(stored(storage)).toHaveLength(1);
    await expect(loadSession("s1")).resolves.toEqual({ ...base, topic: "Food" });
  });

  it("loadSessions summarises newest first with the learner-turn count", async () => {
    const older = { ...base, id: "a", createdAt: "2026-01-01T00:00:00.000Z" };
    const newer: Session = {
      ...base,
      id: "b",
      createdAt: "2026-02-01T00:00:00.000Z",
      turns: [
        { role: "bot", id: "b1", text: "Hi", streaming: false, error: null },
        { role: "user", id: "u1", hint: "x", analysis: null, error: "failed" },
        { role: "bot", id: "b2", text: "Ok", streaming: false, error: null },
        { role: "user", id: "u2", hint: "y", analysis: null, error: "failed" },
      ],
    };
    await saveSession(older);
    await saveSession(newer);
    await expect(loadSessions()).resolves.toEqual([
      { id: "b", topic: "Travel", level: "B1", lang: "es", createdAt: newer.createdAt, turnCount: 2 },
      { id: "a", topic: "Travel", level: "B1", lang: "es", createdAt: older.createdAt, turnCount: 0 },
    ]);
    await expect(loadAllSessions()).resolves.toEqual([newer, older]);
  });

  it("saveSession settles in-flight turns so a reload never shows a stuck spinner", async () => {
    await saveSession({
      ...base,
      turns: [
        { role: "bot", id: "b1", text: "", streaming: true, error: null },
        { role: "user", id: "u1", hint: "hello", analysis: null, error: null },
        { role: "bot", id: "b2", text: "partial", streaming: true, error: null },
      ],
    });
    const saved = await loadSession("s1");
    expect(saved?.turns).toEqual([
      { role: "user", id: "u1", hint: "hello", analysis: null, error: INTERRUPTED_ANALYSIS },
      { role: "bot", id: "b2", text: "partial", streaming: false, error: null },
    ]);
  });

  it("deleteSession removes only that session", async () => {
    await saveSession({ ...base, id: "a" });
    await saveSession({ ...base, id: "b" });
    await deleteSession("a");
    await expect(loadSession("a")).resolves.toBeNull();
    await expect(loadSession("b")).resolves.not.toBeNull();
    await expect(deleteSession("missing")).resolves.toBeUndefined();
  });

  it("normalises legacy entries and drops ones that are not session-shaped, with one warning", async () => {
    const legacy = { ...base, turns: [{ role: "bot", id: "b1", text: "Hi.", streaming: false }] };
    storage.map.set(STORAGE_KEY, JSON.stringify([legacy, null, 42, { id: 7 }]));
    const all = await loadAllSessions();
    expect(all).toHaveLength(1);
    expect(all[0].turns[0]).toEqual({ role: "bot", id: "b1", text: "Hi.", streaming: false, error: null });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toMatch(/3/);
  });

  it("treats an unreadable stored value as an empty list, with a warning", async () => {
    storage.map.set(STORAGE_KEY, "{not json");
    await expect(loadSessions()).resolves.toEqual([]);
    storage.map.set(STORAGE_KEY, JSON.stringify({ not: "an array" }));
    await expect(loadSessions()).resolves.toEqual([]);
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it("rejects with a readable message when localStorage is unavailable", async () => {
    vi.stubGlobal("localStorage", undefined);
    await expect(loadSessions()).rejects.toThrow(/local storage/);
    await expect(saveSession(base)).rejects.toThrow(/local storage/);
  });

  it("createSession is pure: a fresh id, createdAt and no turns, nothing stored", () => {
    const s = createSession({ topic: "Food", level: "A2", lang: "en" });
    expect(s.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(s).toMatchObject({ topic: "Food", level: "A2", lang: "en", turns: [] });
    expect(Number.isNaN(Date.parse(s.createdAt))).toBe(false);
    expect(storage.setItem).not.toHaveBeenCalled();
  });
});
