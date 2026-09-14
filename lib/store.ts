import { newId } from "./ids";
import type { FeedbackLang, Level, Session, Turn } from "./types";

export const STORAGE_KEY = "lt:sessions:v1";

/** Message shown on a learner turn whose analysis never finished before the page went away. */
export const INTERRUPTED_ANALYSIS = "Analysis was interrupted before it finished. Say it again to retry.";

let warned = false;

/** Log a storage failure once per page load; later failures stay quiet so the console is not flooded. */
function warnOnce(action: string, err: unknown): void {
  if (warned) return;
  warned = true;
  console.warn(`[store] localStorage ${action} failed; continuing without persistence.`, err);
}

function storage(): Storage | null {
  if (typeof localStorage === "undefined" || localStorage === null) return null;
  return localStorage;
}

function isTurn(value: unknown): value is Turn {
  if (typeof value !== "object" || value === null) return false;
  const t = value as Record<string, unknown>;
  if (typeof t.id !== "string") return false;
  if (t.role === "user") return "analysis" in t && "error" in t;
  if (t.role === "bot") return typeof t.text === "string";
  return false;
}

function isSession(value: unknown): value is Session {
  if (typeof value !== "object" || value === null) return false;
  const s = value as Record<string, unknown>;
  return (
    typeof s.id === "string" &&
    typeof s.topic === "string" &&
    typeof s.level === "string" &&
    typeof s.lang === "string" &&
    typeof s.createdAt === "string" &&
    Array.isArray(s.turns) &&
    s.turns.every(isTurn)
  );
}

/** Read every stored session, in storage order. Any failure yields an empty list. */
function readAll(): Session[] {
  const s = storage();
  if (!s) return [];
  try {
    const raw = s.getItem(STORAGE_KEY);
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isSession);
  } catch (err) {
    warnOnce("read", err);
    return [];
  }
}

function writeAll(sessions: Session[]): void {
  const s = storage();
  if (!s) return;
  try {
    s.setItem(STORAGE_KEY, JSON.stringify(sessions));
  } catch (err) {
    warnOnce("write", err);
  }
}

/**
 * Copy of a turn with no in-flight state, so a reload never shows a stuck spinner.
 * Returns null for a bot turn that never received any text (nothing worth keeping).
 */
function settleTurn(turn: Turn): Turn | null {
  if (turn.role === "bot") {
    if (!turn.streaming) return turn;
    if (turn.text.length === 0) return null;
    return { ...turn, streaming: false };
  }
  if (turn.analysis === null && turn.error === null) {
    return { ...turn, error: INTERRUPTED_ANALYSIS };
  }
  return turn;
}

function settle(session: Session): Session {
  const turns: Turn[] = [];
  for (const turn of session.turns) {
    const settled = settleTurn(turn);
    if (settled) turns.push(settled);
  }
  return { ...session, turns };
}

/** All sessions, newest first. */
export function loadSessions(): Session[] {
  return readAll().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function loadSession(id: string): Session | null {
  return readAll().find((s) => s.id === id) ?? null;
}

/** Insert or replace the session with the same id. The given object is not mutated. */
export function saveSession(session: Session): void {
  const settled = settle(session);
  const all = readAll();
  const index = all.findIndex((s) => s.id === session.id);
  if (index === -1) all.push(settled);
  else all[index] = settled;
  writeAll(all);
}

export function createSession(input: { topic: string; level: Level; lang: FeedbackLang }): Session {
  const session: Session = {
    id: newId(),
    topic: input.topic,
    level: input.level,
    lang: input.lang,
    createdAt: new Date().toISOString(),
    turns: [],
  };
  saveSession(session);
  return session;
}

export function deleteSession(id: string): void {
  const all = readAll();
  const remaining = all.filter((s) => s.id !== id);
  if (remaining.length === all.length) return;
  writeAll(remaining);
}
