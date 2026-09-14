import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { parseStoredSession, settleSession } from "./session-normalise";
import type { FeedbackLang, Level, Session } from "./types";

/**
 * Server-only SQLite persistence (Node's built-in `node:sqlite`). Never import from a client
 * component. One row per session; `json` holds the full `Session`, the other columns mirror it
 * so lists and ordering need no parsing.
 */

export const DEFAULT_DB_PATH = "data/lt.sqlite";

export type SessionSummary = {
  id: string;
  topic: string;
  level: Level;
  lang: FeedbackLang;
  createdAt: string;
  updatedAt: string;
  /** Number of learner turns (what the home page shows as "turns"). */
  turnCount: number;
};

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    topic TEXT NOT NULL,
    level TEXT NOT NULL,
    lang TEXT NOT NULL,
    json TEXT NOT NULL
  )
`;

const UPSERT = `
  INSERT INTO sessions (id, created_at, updated_at, topic, level, lang, json)
  VALUES (?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    created_at = excluded.created_at,
    updated_at = excluded.updated_at,
    topic = excluded.topic,
    level = excluded.level,
    lang = excluded.lang,
    json = excluded.json
`;

const SUMMARIES = `
  SELECT id, topic, level, lang, created_at, updated_at,
    (SELECT count(*) FROM json_each(sessions.json, '$.turns') WHERE json_extract(value, '$.role') = 'user') AS turn_count
  FROM sessions
  ORDER BY created_at DESC, id
`;

type SummaryRow = {
  id: string;
  topic: string;
  level: Level;
  lang: FeedbackLang;
  created_at: string;
  updated_at: string;
  turn_count: number;
};

let current: { path: string; db: DatabaseSync } | null = null;

function defaultPath(): string {
  return process.env.LT_DB_PATH ?? DEFAULT_DB_PATH;
}

/**
 * The process-wide connection, created on first use together with its directory and schema.
 * Bound to one path: asking for a different one closes the current connection and opens the
 * new file (tests point `LT_DB_PATH` at a temp file per test).
 */
export function openDb(dbPath: string = defaultPath()): DatabaseSync {
  const resolved = dbPath === ":memory:" ? dbPath : path.resolve(dbPath);
  if (current?.path === resolved) return current.db;
  if (current) closeDb();
  if (resolved !== ":memory:") mkdirSync(path.dirname(resolved), { recursive: true });
  const db = new DatabaseSync(resolved);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec(SCHEMA);
  current = { path: resolved, db };
  return db;
}

export function closeDb(): void {
  if (!current) return;
  current.db.close();
  current = null;
}

function parseRow(id: string, json: string): Session {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch (err) {
    throw new Error(`Session ${id} is corrupt: stored json does not parse`, { cause: err });
  }
  const session = parseStoredSession(value);
  if (!session) throw new Error(`Session ${id} is corrupt: stored json is not session-shaped`);
  return session;
}

/** Summaries of every session, newest first. */
export function listSessions(): SessionSummary[] {
  const rows = openDb().prepare(SUMMARIES).all() as unknown as SummaryRow[];
  return rows.map((r) => ({
    id: r.id,
    topic: r.topic,
    level: r.level,
    lang: r.lang,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    turnCount: r.turn_count,
  }));
}

export function getSession(id: string): Session | null {
  const row = openDb().prepare("SELECT json FROM sessions WHERE id = ?").get(id) as { json: string } | undefined;
  if (!row) return null;
  return parseRow(id, row.json);
}

/** Every session in full, newest first (the notebook reads these). */
export function allSessions(): Session[] {
  const rows = openDb().prepare("SELECT id, json FROM sessions ORDER BY created_at DESC, id").all() as unknown as {
    id: string;
    json: string;
  }[];
  return rows.map((r) => parseRow(r.id, r.json));
}

/** Insert or replace the session with the same id; in-flight state is settled first. The given object is not mutated. */
export function putSession(session: Session): void {
  const settled = settleSession(session);
  const now = new Date().toISOString();
  openDb()
    .prepare(UPSERT)
    .run(settled.id, settled.createdAt, now, settled.topic, settled.level, settled.lang, JSON.stringify(settled));
}

/** True when a row was removed. */
export function deleteSession(id: string): boolean {
  const result = openDb().prepare("DELETE FROM sessions WHERE id = ?").run(id);
  return result.changes > 0;
}
