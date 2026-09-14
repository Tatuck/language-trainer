import type { SessionSummary } from "./db";
import { throwIfNotOk } from "./http";
import { newId } from "./ids";
import { parseStoredSession } from "./session-normalise";
import type { FeedbackLang, Level, Session } from "./types";

export type { SessionSummary };

/**
 * Browser-side client for `/api/sessions`. Sessions live in the server's SQLite file; this module
 * only speaks HTTP (plus a one-time import of the localStorage store it replaced).
 */

/** Key of the pre-SQLite localStorage store; only read by `migrateLocalStorage`. */
export const STORAGE_KEY = "lt:sessions:v1";

const BASE = "/api/sessions";

function sessionUrl(id: string): string {
  return `${BASE}/${encodeURIComponent(id)}`;
}

async function request(url: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(url, init);
  await throwIfNotOk(res);
  return res;
}

/** Summaries of every session, newest first. */
export async function loadSessions(): Promise<SessionSummary[]> {
  const res = await request(BASE, { method: "GET" });
  return (await res.json()) as SessionSummary[];
}

export async function loadSession(id: string): Promise<Session | null> {
  const res = await fetch(sessionUrl(id), { method: "GET" });
  if (res.status === 404) return null;
  await throwIfNotOk(res);
  return (await res.json()) as Session;
}

/** Insert or replace the session with the same id. The server settles in-flight turns. */
export async function saveSession(session: Session): Promise<void> {
  await request(sessionUrl(session.id), {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(session),
  });
}

/** Pure: nothing is persisted until the first `saveSession`. */
export function createSession(input: { topic: string; level: Level; lang: FeedbackLang }): Session {
  return {
    id: newId(),
    topic: input.topic,
    level: input.level,
    lang: input.lang,
    createdAt: new Date().toISOString(),
    turns: [],
  };
}

export async function deleteSession(id: string): Promise<void> {
  await request(sessionUrl(id), { method: "DELETE" });
}

function storage(): Storage | null {
  if (typeof localStorage === "undefined" || localStorage === null) return null;
  return localStorage;
}

/** Sessions the old store left in localStorage, or null when there is nothing readable. */
function readLegacySessions(s: Storage): Session[] | null {
  let raw: string | null;
  try {
    raw = s.getItem(STORAGE_KEY);
  } catch (err) {
    console.warn("[store] migration skipped: localStorage read failed.", err);
    return null;
  }
  if (raw === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    console.warn("[store] migration skipped: legacy sessions are not JSON; the key is left in place.", err);
    return null;
  }
  if (!Array.isArray(parsed)) {
    console.warn("[store] migration skipped: legacy value is not a list; the key is left in place.");
    return null;
  }
  const sessions: Session[] = [];
  let skipped = 0;
  for (const entry of parsed) {
    const session = parseStoredSession(entry);
    if (session) sessions.push(session);
    else skipped += 1;
  }
  if (skipped > 0) console.warn(`[store] migration: ${skipped} legacy entries were not session-shaped and were dropped.`);
  return sessions;
}

/**
 * One-time import of the localStorage store into the server: PUT each session, then remove the
 * key. Returns how many were imported. A failing PUT rethrows and leaves the key, so the next
 * page load retries (PUT is an upsert, so partial imports are harmless).
 */
export async function migrateLocalStorage(): Promise<number> {
  const s = storage();
  if (!s) return 0;
  const sessions = readLegacySessions(s);
  if (sessions === null) return 0;
  for (const session of sessions) {
    await saveSession(session);
  }
  try {
    s.removeItem(STORAGE_KEY);
  } catch (err) {
    console.warn("[store] migration: sessions imported but the legacy key could not be removed.", err);
  }
  return sessions.length;
}
