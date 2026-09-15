import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { APIError } from "openai";
import { AnalysisSchema } from "@/lib/schema";
import { SETTINGS_KEY } from "@/lib/settings";
import type { AnalyzeRequest, ReplyRequest } from "@/lib/types";
import fixture from "@/fixtures/analysis.json";

type Api = typeof import("@/lib/api");

const analyzeReq: AnalyzeRequest = { text: "I have 25 years.", level: "B1", lang: "es" };
const replyReq: ReplyRequest = { text: "I have 25 years.", history: [], topic: "Travel", level: "B1" };

function fakeStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
    removeItem: (k: string) => {
      map.delete(k);
    },
  };
}

const settingsJson = JSON.stringify({ apiKey: "sk-or-test", chatModel: "chat/model", audioModel: "audio/model" });

async function* chunks(contents: string[]) {
  for (const content of contents) {
    yield { choices: [{ delta: { content } }] };
  }
}

describe("live mode", () => {
  let api: Api;
  const createMock = vi.fn();
  const createClientMock = vi.fn(() => ({ chat: { completions: { create: createMock } } }));

  beforeEach(async () => {
    createMock.mockReset();
    createClientMock.mockClear();
    vi.stubEnv("NEXT_PUBLIC_MOCK_API", "0");
    vi.stubGlobal("localStorage", fakeStorage({ [SETTINGS_KEY]: settingsJson }));
    vi.resetModules();
    vi.doMock("@/lib/openrouter", () => ({ createClient: createClientMock }));
    api = await import("@/lib/api");
  });
  afterEach(() => {
    vi.doUnmock("@/lib/openrouter");
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("analyze builds a client from the stored key and calls the audio model", async () => {
    createMock.mockResolvedValue({ choices: [{ message: { content: JSON.stringify(fixture) } }] });
    const result = await api.analyze(analyzeReq);
    expect(result).toEqual(AnalysisSchema.parse(fixture));
    expect(createClientMock).toHaveBeenCalledWith("sk-or-test");
    expect(createMock.mock.calls[0][0].model).toBe("audio/model");
  });

  it("analyze forwards the abort signal", async () => {
    createMock.mockResolvedValue({ choices: [{ message: { content: JSON.stringify(fixture) } }] });
    const ac = new AbortController();
    await api.analyze(analyzeReq, ac.signal);
    expect(createMock.mock.calls[0][1]).toEqual({ signal: ac.signal });
  });

  it("streamReply calls the chat model, forwards deltas and resolves with the text", async () => {
    createMock.mockResolvedValue(chunks(["Oh, so ", "you're 25."]));
    const deltas: string[] = [];
    await expect(api.streamReply(replyReq, (t) => deltas.push(t))).resolves.toBe("Oh, so you're 25.");
    expect(deltas).toEqual(["Oh, so ", "you're 25."]);
    expect(createMock.mock.calls[0][0].model).toBe("chat/model");
  });

  it("rejects with a Settings hint when no key is stored, without building a client", async () => {
    vi.stubGlobal("localStorage", fakeStorage());
    await expect(api.analyze(analyzeReq)).rejects.toThrow(/Settings/);
    await expect(api.streamReply(replyReq, () => {})).rejects.toThrow(/Settings/);
    expect(createClientMock).not.toHaveBeenCalled();
  });

  it("maps upstream auth failures to the fixed hint and other failures to their message", async () => {
    createMock.mockRejectedValueOnce(new APIError(401, { message: "bad key sk-or-abc" }, "bad key sk-or-abc", new Headers()));
    await expect(api.analyze(analyzeReq)).rejects.toThrow(/Settings/);
    await expect(api.analyze(analyzeReq)).rejects.not.toThrow(/sk-or-abc/);
    createMock.mockRejectedValueOnce(new APIError(429, { message: "rate limited" }, "rate limited", new Headers()));
    await expect(api.streamReply(replyReq, () => {})).rejects.toThrow(/rate limited/);
  });

  it("rethrows aborts untouched", async () => {
    const abort = new DOMException("aborted", "AbortError");
    createMock.mockRejectedValueOnce(abort);
    await expect(api.analyze(analyzeReq)).rejects.toBe(abort);
  });
});

describe("mock mode", () => {
  let api: Api;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.stubEnv("NEXT_PUBLIC_MOCK_API", "1");
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("fetch must not be called in mock mode"))));
    vi.stubGlobal("localStorage", undefined);
    vi.resetModules();
    api = await import("@/lib/api");
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("analyze resolves the fixture after 1200 ms without a key or the network", async () => {
    const p = api.analyze(analyzeReq);
    let settled = false;
    p.then(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(1199);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(settled).toBe(true);
    expect(await p).toEqual(AnalysisSchema.parse(fixture));
    expect(fetch).not.toHaveBeenCalled();
  });

  it("analyze rejects when aborted", async () => {
    const ac = new AbortController();
    const p = api.analyze(analyzeReq, ac.signal);
    const rejection = expect(p).rejects.toMatchObject({ name: "AbortError" });
    ac.abort();
    await rejection;
  });

  it("streamReply streams a two-sentence reply word by word at 60 ms/word", async () => {
    const deltas: string[] = [];
    const p = api.streamReply(replyReq, (t) => deltas.push(t));
    await vi.advanceTimersByTimeAsync(60);
    expect(deltas.length).toBe(1);
    await vi.advanceTimersByTimeAsync(60);
    expect(deltas.length).toBe(2);
    await vi.runAllTimersAsync();
    const text = await p;
    expect(text).toBe(deltas.join(""));
    expect(text.split(/\s+/).length).toBe(deltas.length);
    expect(text.match(/[.!?](\s|$)/g)?.length).toBe(2);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("streamReply uses an opener when there is no learner input yet", async () => {
    const openerReq: ReplyRequest = { history: [], topic: "Your city", level: "A2" };
    const p = api.streamReply(openerReq, () => {});
    await vi.runAllTimersAsync();
    const opener = await p;
    expect(opener.toLowerCase()).toContain("your city");
    const p2 = api.streamReply(replyReq, () => {});
    await vi.runAllTimersAsync();
    expect(await p2).not.toBe(opener);
  });
});

describe("hasPendingTurn", () => {
  let hasPendingTurn: Api["hasPendingTurn"];
  beforeEach(async () => {
    ({ hasPendingTurn } = await import("@/lib/api"));
  });

  it("is false for an empty or fully settled conversation", () => {
    expect(hasPendingTurn([])).toBe(false);
    expect(
      hasPendingTurn([
        { role: "bot", id: "b1", text: "Hi", streaming: false, error: null },
        { role: "user", id: "u1", hint: "x", analysis: null, error: "Analysis failed" },
        { role: "bot", id: "b2", text: "partial", streaming: false, error: "Stream failed" },
      ])
    ).toBe(false);
  });

  it("is true while a bot reply streams or a learner turn awaits analysis", () => {
    expect(hasPendingTurn([{ role: "bot", id: "b1", text: "", streaming: true, error: null }])).toBe(true);
    expect(hasPendingTurn([{ role: "user", id: "u1", hint: "x", analysis: null, error: null }])).toBe(true);
  });
});

describe("historyFromTurns", () => {
  let historyFromTurns: Api["historyFromTurns"];
  beforeEach(async () => {
    ({ historyFromTurns } = await import("@/lib/api"));
  });

  const analysis = {
    transcript: "I'm 25 years old.",
    unclear: false,
    sentences: [],
    pronunciation: [],
    fluency: null,
  };

  it("maps completed turns to plain-text history, preferring the analysed transcript", () => {
    const history = historyFromTurns([
      { role: "bot", id: "b1", text: "Hi! How old are you?", streaming: false, error: null },
      { role: "user", id: "u1", hint: "i have 25 years", analysis, error: null },
      { role: "bot", id: "b2", text: "Oh, so you're 25.", streaming: false, error: null },
      { role: "user", id: "u2", hint: "yes exactly", analysis: null, error: "Analysis failed" },
    ]);
    expect(history).toEqual([
      { role: "assistant", content: "Hi! How old are you?" },
      { role: "user", content: "I'm 25 years old." },
      { role: "assistant", content: "Oh, so you're 25." },
      { role: "user", content: "yes exactly" },
    ]);
  });

  it("skips streaming or empty bot turns and user turns with nothing to say", () => {
    const history = historyFromTurns([
      { role: "bot", id: "b1", text: "", streaming: false, error: null },
      { role: "bot", id: "b2", text: "partial", streaming: true, error: null },
      { role: "user", id: "u1", hint: null, analysis: null, error: "Mic failed" },
      { role: "user", id: "u2", hint: "   ", analysis: null, error: "Mic failed" },
      { role: "user", id: "u3", hint: "still analysing", analysis: null, error: null },
    ]);
    expect(history).toEqual([]);
  });

  it("skips bot turns that ended in an error, even when partial text arrived", () => {
    const history = historyFromTurns([
      { role: "bot", id: "b1", text: "Hi! How old", streaming: false, error: "Stream failed" },
      { role: "user", id: "u1", hint: "i am 25", analysis: null, error: "Analysis failed" },
      { role: "bot", id: "b2", text: "", streaming: false, error: "Upstream authentication failed" },
    ]);
    expect(history).toEqual([{ role: "user", content: "i am 25" }]);
  });
});
