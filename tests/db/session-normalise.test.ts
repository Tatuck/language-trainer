import { describe, expect, it } from "vitest";
import {
  INTERRUPTED_ANALYSIS,
  MAX_SESSION_TURNS,
  SessionSchema,
  parseStoredSession,
  settleSession,
} from "@/lib/session-normalise";
import type { Session } from "@/lib/types";

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

describe("settleSession", () => {
  it("strips streaming state, drops empty bot turns and marks pending user turns as interrupted", () => {
    const s: Session = {
      ...base,
      turns: [
        { role: "bot", id: "b1", text: "Hi there. What do you like?", streaming: false, error: null },
        { role: "user", id: "u1", hint: "I like food", analysis: null, error: null },
        { role: "bot", id: "b2", text: "Nice, so you", streaming: true, error: null },
        { role: "bot", id: "b3", text: "", streaming: true, error: null },
      ],
    };
    const settled = settleSession(s);
    expect(settled.turns.map((t) => t.id)).toEqual(["b1", "u1", "b2"]);
    expect(settled.turns[2]).toEqual({ role: "bot", id: "b2", text: "Nice, so you", streaming: false, error: null });
    expect(settled.turns[1]).toEqual({
      role: "user",
      id: "u1",
      hint: "I like food",
      analysis: null,
      error: INTERRUPTED_ANALYSIS,
    });
    expect(INTERRUPTED_ANALYSIS.length).toBeGreaterThan(0);
    // the given object is not mutated
    expect(s.turns[2]).toMatchObject({ streaming: true });
    expect(s.turns[1]).toMatchObject({ error: null });
  });

  it("keeps analysed and errored user turns and finished bot turns untouched", () => {
    const s: Session = {
      ...base,
      turns: [
        { role: "user", id: "u1", hint: null, analysis, error: null },
        { role: "user", id: "u2", hint: "x", analysis: null, error: "Network down" },
        { role: "bot", id: "b1", text: "partial", streaming: false, error: "Stream failed" },
      ],
    };
    expect(settleSession(s).turns).toEqual(s.turns);
  });
});

describe("parseStoredSession", () => {
  it("returns a valid session unchanged", () => {
    const s: Session = {
      ...base,
      turns: [
        { role: "user", id: "u1", hint: null, analysis, error: null },
        { role: "bot", id: "b1", text: "Hi.", streaming: false, error: null },
      ],
    };
    expect(parseStoredSession(s)).toEqual(s);
  });

  it("normalises bot turns stored before the error field existed to error: null", () => {
    const stored = {
      ...base,
      turns: [
        { role: "bot", id: "b1", text: "Hi there.", streaming: false },
        { role: "user", id: "u1", hint: "hey", analysis: null, error: "x" },
        { role: "bot", id: "b2", text: "partial", streaming: false, error: "Stream failed" },
      ],
    };
    const parsed = parseStoredSession(stored);
    expect(parsed).not.toBeNull();
    expect(parsed!.turns).toEqual([
      { role: "bot", id: "b1", text: "Hi there.", streaming: false, error: null },
      { role: "user", id: "u1", hint: "hey", analysis: null, error: "x" },
      { role: "bot", id: "b2", text: "partial", streaming: false, error: "Stream failed" },
    ]);
  });

  it("returns null for values that are not session-shaped", () => {
    expect(parseStoredSession(null)).toBeNull();
    expect(parseStoredSession(42)).toBeNull();
    expect(parseStoredSession({ id: 7 })).toBeNull();
    expect(parseStoredSession({ ...base, turns: "nope" })).toBeNull();
    expect(parseStoredSession({ ...base, level: "Z9" })).toBeNull();
    expect(parseStoredSession({ ...base, lang: "fr" })).toBeNull();
    expect(parseStoredSession({ ...base, createdAt: "yesterday" })).toBeNull();
    expect(parseStoredSession({ ...base, turns: [{ role: "bot", id: "b1", streaming: false }] })).toBeNull();
    expect(parseStoredSession({ ...base, turns: [{ role: "user", id: "u1", hint: null }] })).toBeNull();
    expect(parseStoredSession({ ...base, turns: [{ role: "system", id: "x" }] })).toBeNull();
  });

  it("applies the same limits as the API schema", () => {
    expect(parseStoredSession({ ...base, topic: "" })).toBeNull();
    expect(parseStoredSession({ ...base, topic: "t".repeat(201) })).toBeNull();
    expect(parseStoredSession({ ...base, topic: "t".repeat(200) })).not.toBeNull();
    const bot = { role: "bot", id: "b", text: "x", streaming: false, error: null };
    expect(parseStoredSession({ ...base, turns: Array.from({ length: MAX_SESSION_TURNS + 1 }, () => bot) })).toBeNull();
    expect(parseStoredSession({ ...base, turns: Array.from({ length: MAX_SESSION_TURNS }, () => bot) })).not.toBeNull();
  });
});

describe("SessionSchema", () => {
  it("is strict about the bot error field and the 500-turn / 200-char limits", () => {
    expect(MAX_SESSION_TURNS).toBe(500);
    expect(SessionSchema.safeParse(base).success).toBe(true);
    expect(SessionSchema.safeParse({ ...base, turns: [{ role: "bot", id: "b1", text: "x", streaming: false }] }).success).toBe(false);
    expect(SessionSchema.safeParse({ ...base, topic: "t".repeat(201) }).success).toBe(false);
    expect(SessionSchema.safeParse({ ...base, id: "" }).success).toBe(false);
    expect(SessionSchema.safeParse({ ...base, extra: 1 }).success).toBe(true);
  });
});
