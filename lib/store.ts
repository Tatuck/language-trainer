import { newId } from "./ids";
import { parseStoredSession, settleSession } from "./session-normalise";
import type { FeedbackLang, Level, Session } from "./types";

/**
 * Sessions live in this browser's localStorage as one JSON array under `STORAGE_KEY`. The functions
 * stay async so the pages that call them do not care where the data comes from.
 */

export const STORAGE_KEY = "lt:sessions:v1";

export type SessionSummary = {
  id: string;
  topic: string;
  level: Level;
  lang: FeedbackLang;
  createdAt: string;
  /** Number of learner turns (what the home page shows as "turns"). */
  turnCount: number;
};

function storage(): Storage {
  if (typeof localStorage === "undefined" || localStorage === null) {
    throw new Error("This browser has no local storage, so sessions cannot be kept.");
  }
  return localStorage;
}

/** Every readable session in storage order; entries that are not session-shaped are dropped with one warning. */
function readAll(): Session[] {
  const raw = storage().getItem(STORAGE_KEY);
  if (raw === null) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    console.warn("[store] stored sessions are not JSON; starting from an empty list.", err);
    return [];
  }
  if (!Array.isArray(parsed)) {
    console.warn("[store] stored value is not a list; starting from an empty list.");
    return [];
  }
  const sessions: Session[] = [];
  let skipped = 0;
  for (const entry of parsed) {
    const session = parseStoredSession(entry);
    if (session) sessions.push(session);
    else skipped += 1;
  }
  if (skipped > 0) console.warn(`[store] ${skipped} stored entries were not session-shaped and were dropped.`);
  return sessions;
}

function writeAll(sessions: Session[]): void {
  storage().setItem(STORAGE_KEY, JSON.stringify(sessions));
}

function byNewest(a: Session, b: Session): number {
  return b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id);
}

/** Full sessions, newest first. */
export async function loadAllSessions(): Promise<Session[]> {
  return readAll().sort(byNewest);
}

/** Summaries of every session, newest first. */
export async function loadSessions(): Promise<SessionSummary[]> {
  return (await loadAllSessions()).map((s) => ({
    id: s.id,
    topic: s.topic,
    level: s.level,
    lang: s.lang,
    createdAt: s.createdAt,
    turnCount: s.turns.filter((t) => t.role === "user").length,
  }));
}

export async function loadSession(id: string): Promise<Session | null> {
  return readAll().find((s) => s.id === id) ?? null;
}

/** Insert or replace the session with the same id. In-flight turns are settled so a reload never shows a stuck spinner. */
export async function saveSession(session: Session): Promise<void> {
  const settled = settleSession(session);
  const sessions = readAll();
  const index = sessions.findIndex((s) => s.id === settled.id);
  if (index === -1) sessions.push(settled);
  else sessions[index] = settled;
  writeAll(sessions);
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
  writeAll(readAll().filter((s) => s.id !== id));
}
