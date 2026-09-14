import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { INTERRUPTED_ANALYSIS } from "@/lib/session-normalise";
import type { Session } from "@/lib/types";

type Db = typeof import("@/lib/db");

const base: Session = {
  id: "s1",
  topic: "Travel",
  level: "B1",
  lang: "es",
  createdAt: "2026-09-14T08:00:00.000Z",
  turns: [],
};

const analysis = {
  transcript: "Hello.",
  unclear: false,
  sentences: [{ text: "Hello.", verdict: "good" as const, issue: null, correction: null, alternatives: [] }],
  pronunciation: [],
  fluency: null,
};

describe("db", () => {
  let dir: string;
  let file: string;
  let db: Db;

  beforeEach(async () => {
    dir = mkdtempSync(path.join(tmpdir(), "lt-db-"));
    file = path.join(dir, "nested", "lt.sqlite");
    process.env.LT_DB_PATH = file;
    db = await import("@/lib/db");
  });

  afterEach(() => {
    db.closeDb();
    delete process.env.LT_DB_PATH;
    rmSync(dir, { recursive: true, force: true });
  });

  it("creates the directory, the file and the schema lazily, in WAL mode", () => {
    expect(existsSync(file)).toBe(false);
    const handle = db.openDb();
    expect(existsSync(file)).toBe(true);
    expect(handle.prepare("PRAGMA journal_mode").get()).toEqual({ journal_mode: "wal" });
    const columns = handle
      .prepare("PRAGMA table_info(sessions)")
      .all()
      .map((c) => `${String(c.name)}:${String(c.type)}`);
    expect(columns).toEqual([
      "id:TEXT",
      "created_at:TEXT",
      "updated_at:TEXT",
      "topic:TEXT",
      "level:TEXT",
      "lang:TEXT",
      "json:TEXT",
    ]);
  });

  it("returns the same instance on repeated opens of the same path", () => {
    // Object.is rather than toBe: a failing toBe would deep-inspect the handle.
    expect(Object.is(db.openDb(), db.openDb())).toBe(true);
    expect(Object.is(db.openDb(file), db.openDb())).toBe(true);
  });

  it("switches to a different file when asked for another path", () => {
    const first = db.openDb();
    db.putSession(base);
    const other = path.join(dir, "other.sqlite");
    const second = db.openDb(other);
    expect(Object.is(second, first)).toBe(false);
    expect(Object.is(db.openDb(other), second)).toBe(true);
    expect(second.prepare("SELECT count(*) AS n FROM sessions").get()).toEqual({ n: 0 });
    expect(readdirSync(dir)).toContain("other.sqlite");
    // the default path wins again on the next argument-less open, and its data is still there
    expect(db.getSession("s1")).toEqual(base);
  });

  it("starts empty", () => {
    expect(db.listSessions()).toEqual([]);
    expect(db.allSessions()).toEqual([]);
    expect(db.getSession("nope")).toBeNull();
  });

  it("putSession upserts by id and getSession returns the stored session", () => {
    db.putSession(base);
    expect(db.getSession("s1")).toEqual(base);
    db.putSession({ ...base, topic: "Renamed", turns: [{ role: "bot", id: "b1", text: "Hi.", streaming: false, error: null }] });
    const loaded = db.getSession("s1");
    expect(loaded?.topic).toBe("Renamed");
    expect(loaded?.turns).toHaveLength(1);
    expect(db.listSessions()).toHaveLength(1);
  });

  it("listSessions gives summaries newest first with the learner turn count and timestamps", () => {
    db.putSession({ ...base, id: "a", createdAt: "2026-01-01T00:00:00.000Z" });
    db.putSession({
      ...base,
      id: "b",
      createdAt: "2026-02-01T00:00:00.000Z",
      turns: [
        { role: "bot", id: "b1", text: "Hi.", streaming: false, error: null },
        { role: "user", id: "u1", hint: null, analysis, error: null },
        { role: "bot", id: "b2", text: "Nice.", streaming: false, error: null },
        { role: "user", id: "u2", hint: "x", analysis: null, error: "failed" },
      ],
    });
    const list = db.listSessions();
    expect(list.map((s) => s.id)).toEqual(["b", "a"]);
    expect(list[0]).toEqual({
      id: "b",
      topic: "Travel",
      level: "B1",
      lang: "es",
      createdAt: "2026-02-01T00:00:00.000Z",
      updatedAt: expect.any(String),
      turnCount: 2,
    });
    expect(list[1].turnCount).toBe(0);
    expect(Number.isNaN(Date.parse(list[0].updatedAt))).toBe(false);
  });

  it("bumps updated_at on every put and keeps created_at", () => {
    db.putSession(base);
    const first = db.listSessions()[0];
    expect(first.createdAt).toBe(base.createdAt);
    db.putSession({ ...base, topic: "Again" });
    const second = db.listSessions()[0];
    expect(second.createdAt).toBe(base.createdAt);
    expect(Date.parse(second.updatedAt)).toBeGreaterThanOrEqual(Date.parse(first.updatedAt));
  });

  it("settles in-flight state on put and does not mutate the given object", () => {
    const s: Session = {
      ...base,
      turns: [
        { role: "bot", id: "b1", text: "Hi there.", streaming: false, error: null },
        { role: "user", id: "u1", hint: "I like food", analysis: null, error: null },
        { role: "bot", id: "b2", text: "Nice, so you", streaming: true, error: null },
        { role: "bot", id: "b3", text: "", streaming: true, error: null },
      ],
    };
    db.putSession(s);
    const turns = db.getSession("s1")!.turns;
    expect(turns.map((t) => t.id)).toEqual(["b1", "u1", "b2"]);
    expect(turns[1]).toMatchObject({ analysis: null, error: INTERRUPTED_ANALYSIS });
    expect(turns[2]).toMatchObject({ streaming: false });
    expect(s.turns[2]).toMatchObject({ streaming: true });
    expect(s.turns[1]).toMatchObject({ error: null });
  });

  it("normalises rows whose bot turns lack the error field on read", () => {
    const handle = db.openDb();
    handle
      .prepare("INSERT INTO sessions (id, created_at, updated_at, topic, level, lang, json) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(
        "old",
        base.createdAt,
        base.createdAt,
        base.topic,
        base.level,
        base.lang,
        JSON.stringify({ ...base, id: "old", turns: [{ role: "bot", id: "b1", text: "Hi.", streaming: false }] }),
      );
    expect(db.getSession("old")!.turns[0]).toEqual({ role: "bot", id: "b1", text: "Hi.", streaming: false, error: null });
    expect(db.allSessions()[0].turns[0]).toMatchObject({ error: null });
  });

  it("throws a descriptive error on a corrupt row instead of returning garbage", () => {
    const handle = db.openDb();
    handle
      .prepare("INSERT INTO sessions (id, created_at, updated_at, topic, level, lang, json) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run("bad", base.createdAt, base.createdAt, "t", "B1", "es", "{not json");
    expect(() => db.getSession("bad")).toThrow(/bad/);
    expect(() => db.allSessions()).toThrow(/bad/);
  });

  it("allSessions returns full sessions newest first", () => {
    db.putSession({ ...base, id: "a", createdAt: "2026-01-01T00:00:00.000Z" });
    db.putSession({ ...base, id: "b", createdAt: "2026-02-01T00:00:00.000Z" });
    expect(db.allSessions().map((s) => s.id)).toEqual(["b", "a"]);
    expect(db.allSessions()[1]).toEqual({ ...base, id: "a", createdAt: "2026-01-01T00:00:00.000Z" });
  });

  it("deleteSession removes only that session and reports whether it existed", () => {
    db.putSession({ ...base, id: "a" });
    db.putSession({ ...base, id: "b" });
    expect(db.deleteSession("a")).toBe(true);
    expect(db.deleteSession("a")).toBe(false);
    expect(db.listSessions().map((s) => s.id)).toEqual(["b"]);
    expect(db.getSession("a")).toBeNull();
  });

  it("persists across close and reopen of the same file", () => {
    db.putSession(base);
    db.closeDb();
    expect(db.getSession("s1")).toEqual(base);
  });
});
