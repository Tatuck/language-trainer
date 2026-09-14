import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "@/lib/types";

type Store = typeof import("@/lib/store");

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

describe("store", () => {
  let storage: ReturnType<typeof fakeStorage>;
  let warn: ReturnType<typeof vi.spyOn>;
  let STORAGE_KEY: Store["STORAGE_KEY"];
  let createSession: Store["createSession"];
  let deleteSession: Store["deleteSession"];
  let loadSession: Store["loadSession"];
  let loadSessions: Store["loadSessions"];
  let saveSession: Store["saveSession"];

  beforeEach(async () => {
    storage = fakeStorage();
    vi.stubGlobal("localStorage", storage);
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.resetModules();
    ({ STORAGE_KEY, createSession, deleteSession, loadSession, loadSessions, saveSession } = await import("@/lib/store"));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("uses the versioned key", () => {
    expect(STORAGE_KEY).toBe("lt:sessions:v1");
  });

  it("returns an empty list when nothing is stored", () => {
    expect(loadSessions()).toEqual([]);
    expect(loadSession("nope")).toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });

  it("createSession persists a new session with id, createdAt and no turns", () => {
    const s = createSession({ topic: "Food", level: "A2", lang: "en" });
    expect(s.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(s.topic).toBe("Food");
    expect(s.level).toBe("A2");
    expect(s.lang).toBe("en");
    expect(Number.isNaN(Date.parse(s.createdAt))).toBe(false);
    expect(s.turns).toEqual([]);
    expect(loadSession(s.id)).toEqual(s);
  });

  it("saveSession upserts by id and loadSessions lists newest first", () => {
    saveSession({ ...base, id: "a", createdAt: "2026-01-01T00:00:00.000Z" });
    saveSession({ ...base, id: "b", createdAt: "2026-02-01T00:00:00.000Z" });
    saveSession({ ...base, id: "a", createdAt: "2026-01-01T00:00:00.000Z", topic: "Renamed" });
    const list = loadSessions();
    expect(list.map((s) => s.id)).toEqual(["b", "a"]);
    expect(list[1].topic).toBe("Renamed");
  });

  it("deleteSession removes only that session", () => {
    saveSession({ ...base, id: "a" });
    saveSession({ ...base, id: "b" });
    deleteSession("a");
    expect(loadSessions().map((s) => s.id)).toEqual(["b"]);
    expect(loadSession("a")).toBeNull();
  });

  it("strips streaming state and drops empty bot turns when saving", () => {
    const s: Session = {
      ...base,
      turns: [
        { role: "bot", id: "b1", text: "Hi there. What do you like?", streaming: false, error: null },
        { role: "user", id: "u1", hint: "I like food", analysis: null, error: null },
        { role: "bot", id: "b2", text: "Nice, so you", streaming: true, error: null },
        { role: "bot", id: "b3", text: "", streaming: true, error: null },
      ],
    };
    saveSession(s);
    const loaded = loadSession("s1");
    expect(loaded).not.toBeNull();
    const turns = loaded!.turns;
    expect(turns.map((t) => t.id)).toEqual(["b1", "u1", "b2"]);
    expect(turns[2]).toEqual({ role: "bot", id: "b2", text: "Nice, so you", streaming: false, error: null });
    const user = turns[1];
    expect(user.role).toBe("user");
    if (user.role === "user") {
      expect(user.analysis).toBeNull();
      expect(user.error).toEqual(expect.any(String));
      expect(user.error!.length).toBeGreaterThan(0);
      expect(user.hint).toBe("I like food");
    }
    // in-memory session must not be mutated
    expect(s.turns[2]).toMatchObject({ streaming: true });
    expect(s.turns[1]).toMatchObject({ error: null });
  });

  it("keeps analysed and errored user turns untouched", () => {
    const analysis = {
      transcript: "Hello.",
      unclear: false,
      sentences: [{ text: "Hello.", verdict: "good" as const, issue: null, correction: null, alternatives: [] }],
      pronunciation: [],
      fluency: null,
    };
    saveSession({
      ...base,
      turns: [
        { role: "user", id: "u1", hint: null, analysis, error: null },
        { role: "user", id: "u2", hint: "x", analysis: null, error: "Network down" },
      ],
    });
    const turns = loadSession("s1")!.turns;
    expect(turns[0]).toMatchObject({ analysis, error: null });
    expect(turns[1]).toMatchObject({ analysis: null, error: "Network down" });
  });

  it("returns empty and warns on every failing load when storage holds invalid JSON", () => {
    storage.map.set(STORAGE_KEY, "{not json");
    expect(loadSessions()).toEqual([]);
    expect(loadSessions()).toEqual([]);
    expect(loadSession("s1")).toBeNull();
    expect(warn).toHaveBeenCalledTimes(3);
    expect(String(warn.mock.calls[0][0])).toMatch(/load/);
  });

  it("normalises bot turns stored before the error field existed to error: null", () => {
    storage.map.set(
      STORAGE_KEY,
      JSON.stringify([
        {
          ...base,
          turns: [
            { role: "bot", id: "b1", text: "Hi there.", streaming: false },
            { role: "user", id: "u1", hint: "hey", analysis: null, error: "x" },
            { role: "bot", id: "b2", text: "partial", streaming: false, error: "Stream failed" },
          ],
        },
      ])
    );
    const turns = loadSession("s1")!.turns;
    expect(turns[0]).toEqual({ role: "bot", id: "b1", text: "Hi there.", streaming: false, error: null });
    expect(turns[1]).toEqual({ role: "user", id: "u1", hint: "hey", analysis: null, error: "x" });
    expect(turns[2]).toEqual({ role: "bot", id: "b2", text: "partial", streaming: false, error: "Stream failed" });
    expect(loadSessions()[0].turns[0]).toMatchObject({ error: null });
  });

  it("ignores entries that are not session-shaped", () => {
    storage.map.set(STORAGE_KEY, JSON.stringify([base, null, 42, { id: 7 }, { ...base, id: "ok", turns: "nope" }]));
    expect(loadSessions().map((s) => s.id)).toEqual(["s1"]);
  });

  it("returns empty and warns on every failing load when getItem throws (private mode)", () => {
    storage.getItem.mockImplementation(() => {
      throw new Error("SecurityError");
    });
    expect(loadSessions()).toEqual([]);
    expect(loadSessions()).toEqual([]);
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it("is a no-op and warns per failing save when setItem throws (quota)", () => {
    storage.setItem.mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    expect(() => saveSession(base)).not.toThrow();
    const created = createSession({ topic: "Work", level: "C1", lang: "es" });
    expect(created.topic).toBe("Work");
    expect(warn).toHaveBeenCalledTimes(2);
    expect(String(warn.mock.calls[0][0])).toMatch(/save/);
    expect(String(warn.mock.calls[1][0])).toMatch(/save/);
  });

  it("is a no-op and warns per failing delete when setItem throws", () => {
    saveSession(base);
    storage.setItem.mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    expect(() => deleteSession("s1")).not.toThrow();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toMatch(/delete/);
  });

  it("behaves as empty when localStorage is not defined (server render)", () => {
    vi.stubGlobal("localStorage", undefined);
    expect(loadSessions()).toEqual([]);
    expect(() => saveSession(base)).not.toThrow();
    expect(warn).not.toHaveBeenCalled();
  });
});
