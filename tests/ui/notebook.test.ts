import { describe, expect, it } from "vitest";
import { buildNotebook, type NotebookEntry } from "@/lib/notebook";
import type { Analysis, Session, Turn } from "@/lib/types";

const base: Session = {
  id: "s1",
  topic: "Travel",
  level: "B1",
  lang: "es",
  createdAt: "2026-09-14T08:00:00.000Z",
  turns: [],
};

function analysed(id: string, sentences: Analysis["sentences"]): Turn {
  return {
    role: "user",
    id,
    hint: null,
    analysis: {
      transcript: sentences.map((s) => s.text).join(" "),
      unclear: false,
      sentences,
      pronunciation: [],
      fluency: null,
    },
    error: null,
  };
}

const good = { text: "I like it.", verdict: "good" as const, issue: null, correction: null, alternatives: [] };
const improve = {
  text: "I very like travel.",
  verdict: "improve" as const,
  issue: "Word order",
  correction: "I really like travelling.",
  alternatives: ["I love travelling.", "Travelling is something I really enjoy."],
};
const error = {
  text: "She go yesterday.",
  verdict: "error" as const,
  issue: "Past tense",
  correction: "She went yesterday.",
  alternatives: [],
};

describe("buildNotebook", () => {
  it("is empty for no sessions, sessions without turns and sessions with only good sentences", () => {
    expect(buildNotebook([])).toEqual([]);
    expect(buildNotebook([base])).toEqual([]);
    expect(buildNotebook([{ ...base, turns: [analysed("u1", [good, good])] }])).toEqual([]);
  });

  it("keeps only improve and error sentences, in sentence order, with the session's topic and date", () => {
    const entries = buildNotebook([{ ...base, turns: [analysed("u1", [good, improve, error])] }]);
    const expected: NotebookEntry[] = [
      {
        sessionId: "s1",
        topic: "Travel",
        date: base.createdAt,
        text: improve.text,
        verdict: "improve",
        issue: improve.issue,
        correction: improve.correction,
        alternatives: improve.alternatives,
      },
      {
        sessionId: "s1",
        topic: "Travel",
        date: base.createdAt,
        text: error.text,
        verdict: "error",
        issue: error.issue,
        correction: error.correction,
        alternatives: [],
      },
    ];
    expect(entries).toEqual(expected);
  });

  it("skips pending and failed learner turns and every bot turn", () => {
    const turns: Turn[] = [
      { role: "bot", id: "b1", text: "Hi. She go yesterday.", streaming: false, error: null },
      { role: "user", id: "u1", hint: "She go yesterday", analysis: null, error: null },
      { role: "user", id: "u2", hint: "She go yesterday", analysis: null, error: "Network down" },
      analysed("u3", [error]),
    ];
    const entries = buildNotebook([{ ...base, turns }]);
    expect(entries.map((e) => e.text)).toEqual([error.text]);
  });

  it("orders sessions newest first regardless of input order, keeping turn order within a session", () => {
    const older: Session = {
      ...base,
      id: "old",
      topic: "Food",
      createdAt: "2026-01-01T00:00:00.000Z",
      turns: [analysed("u1", [improve]), analysed("u2", [error])],
    };
    const newer: Session = { ...base, id: "new", createdAt: "2026-02-01T00:00:00.000Z", turns: [analysed("u1", [error])] };
    const entries = buildNotebook([older, newer]);
    expect(entries.map((e) => `${e.sessionId}:${e.verdict}`)).toEqual(["new:error", "old:improve", "old:error"]);
    expect(entries[1].topic).toBe("Food");
  });

  it("does not depend on the given arrays: sessions and alternatives are not mutated or shared", () => {
    const session: Session = { ...base, turns: [analysed("u1", [improve])] };
    const input = [session];
    const entries = buildNotebook(input);
    expect(input).toEqual([session]);
    entries[0].alternatives.push("mutated");
    expect(improve.alternatives).toHaveLength(2);
  });
});
