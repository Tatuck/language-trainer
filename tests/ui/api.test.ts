import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnalysisSchema } from "@/lib/schema";
import type { AnalyzeRequest, ReplyRequest } from "@/lib/types";
import fixture from "@/fixtures/analysis.json";

type Api = typeof import("@/lib/api");

const analyzeReq: AnalyzeRequest = { text: "I have 25 years.", level: "B1", lang: "es" };
const replyReq: ReplyRequest = { text: "I have 25 years.", history: [], topic: "Travel", level: "B1" };

function sse(...events: string[]): string {
  return events.map((e) => `data: ${e}\n\n`).join("");
}

function streamResponse(chunks: string[], init: ResponseInit = {}, onCancel?: () => void): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(encoder.encode(c));
      if (!onCancel) controller.close();
    },
    cancel() {
      onCancel?.();
    },
  });
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" }, ...init });
}

describe("parseSseChunks", () => {
  let parseSseChunks: Api["parseSseChunks"];
  beforeEach(async () => {
    ({ parseSseChunks } = await import("@/lib/api"));
  });

  it("emits delta, error and done events from complete chunks", () => {
    const p = parseSseChunks();
    expect(p.push(sse('{"delta":"Hi "}', '{"delta":"there"}'))).toEqual([
      { type: "delta", delta: "Hi " },
      { type: "delta", delta: "there" },
    ]);
    expect(p.push(sse('{"error":"boom"}'))).toEqual([{ type: "error", error: "boom" }]);
    expect(p.push(sse("[DONE]"))).toEqual([{ type: "done" }]);
  });

  it("buffers events that are split across chunks, even mid-delimiter", () => {
    const p = parseSseChunks();
    expect(p.push('data: {"del')).toEqual([]);
    expect(p.push('ta":"Hel')).toEqual([]);
    expect(p.push('lo"}\n')).toEqual([]);
    expect(p.push("\n")).toEqual([{ type: "delta", delta: "Hello" }]);
    expect(p.push("data: [DO")).toEqual([]);
    expect(p.push("NE]\n\ndata: {\"delta\":\"late\"}\n\n")).toEqual([{ type: "done" }, { type: "delta", delta: "late" }]);
  });

  it("accepts CRLF line endings and no space after the colon", () => {
    const p = parseSseChunks();
    expect(p.push('data:{"delta":"a"}\r\n\r\ndata: [DONE]\r\n\r\n')).toEqual([
      { type: "delta", delta: "a" },
      { type: "done" },
    ]);
  });

  it("ignores comments, event/id/retry fields and blank events", () => {
    const p = parseSseChunks();
    expect(p.push(': keep-alive\n\nevent: message\nid: 3\nretry: 1000\ndata: {"delta":"x"}\n\n\n\n')).toEqual([
      { type: "delta", delta: "x" },
    ]);
  });

  it("joins multi-line data fields with a newline before parsing", () => {
    const p = parseSseChunks();
    expect(p.push('data: {"delta":\ndata: "two"}\n\n')).toEqual([{ type: "delta", delta: "two" }]);
  });

  it("reports malformed JSON as an error event", () => {
    const p = parseSseChunks();
    const events = p.push("data: {nope\n\n");
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("error");
  });

  it("reports well-formed JSON without delta or error as an error event", () => {
    const p = parseSseChunks();
    const events = p.push('data: {"foo":1}\n\n');
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("error");
  });

  it("flush() drains a trailing event that lacks the final blank line", () => {
    const p = parseSseChunks();
    expect(p.push('data: {"delta":"tail"}')).toEqual([]);
    expect(p.flush()).toEqual([{ type: "delta", delta: "tail" }]);
    expect(p.flush()).toEqual([]);
  });
});

describe("analyze (live)", () => {
  let analyze: Api["analyze"];
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(async () => {
    vi.stubEnv("NEXT_PUBLIC_MOCK_API", "0");
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
    vi.resetModules();
    ({ analyze } = await import("@/lib/api"));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("POSTs JSON to /api/turn/analyze and returns the validated analysis", async () => {
    fetchMock.mockResolvedValue(Response.json(fixture));
    const result = await analyze(analyzeReq);
    expect(result).toEqual(AnalysisSchema.parse(fixture));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/turn/analyze");
    expect(init?.method).toBe("POST");
    expect(new Headers(init?.headers).get("content-type")).toBe("application/json");
    expect(JSON.parse(String(init?.body))).toEqual(analyzeReq);
  });

  it("forwards the abort signal", async () => {
    fetchMock.mockResolvedValue(Response.json(fixture));
    const ac = new AbortController();
    await analyze(analyzeReq, ac.signal);
    expect(fetchMock.mock.calls[0][1]?.signal).toBe(ac.signal);
  });

  it("throws body.error on a non-2xx JSON response", async () => {
    fetchMock.mockResolvedValue(Response.json({ error: "model exploded" }, { status: 502 }));
    await expect(analyze(analyzeReq)).rejects.toThrow("model exploded");
  });

  it("throws the status text when the error body is not JSON", async () => {
    fetchMock.mockResolvedValue(new Response("<html>", { status: 503, statusText: "Service Unavailable" }));
    await expect(analyze(analyzeReq)).rejects.toThrow("Service Unavailable");
  });

  it("falls back to the status code when statusText is empty", async () => {
    fetchMock.mockResolvedValue(new Response("", { status: 500, statusText: "" }));
    await expect(analyze(analyzeReq)).rejects.toThrow(/500/);
  });

  it("rejects a 2xx response that does not match the schema", async () => {
    fetchMock.mockResolvedValue(Response.json({ transcript: "x" }));
    await expect(analyze(analyzeReq)).rejects.toThrow();
  });
});

describe("streamReply (live)", () => {
  let streamReply: Api["streamReply"];
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(async () => {
    vi.stubEnv("NEXT_PUBLIC_MOCK_API", "0");
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
    vi.resetModules();
    ({ streamReply } = await import("@/lib/api"));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("POSTs to /api/turn/reply, calls onDelta per delta and resolves with the full text", async () => {
    fetchMock.mockResolvedValue(
      streamResponse(['data: {"delta":"Oh, so "}\n\ndata: {"del', 'ta":"you\'re 25."}\n\n', "data: [DONE]\n\n"]),
    );
    const deltas: string[] = [];
    const text = await streamReply(replyReq, (t) => deltas.push(t));
    expect(deltas).toEqual(["Oh, so ", "you're 25."]);
    expect(text).toBe("Oh, so you're 25.");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/turn/reply");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual(replyReq);
  });

  it("rejects with the streamed error message", async () => {
    fetchMock.mockResolvedValue(streamResponse(['data: {"delta":"partial"}\n\n', 'data: {"error":"upstream 429"}\n\n']));
    await expect(streamReply(replyReq, () => {})).rejects.toThrow("upstream 429");
  });

  it("rejects with body.error on a non-2xx response", async () => {
    fetchMock.mockResolvedValue(Response.json({ error: "missing input" }, { status: 400 }));
    await expect(streamReply(replyReq, () => {})).rejects.toThrow("missing input");
  });

  it("rejects when the stream ends without [DONE]", async () => {
    fetchMock.mockResolvedValue(streamResponse(['data: {"delta":"half"}\n\n']));
    await expect(streamReply(replyReq, () => {})).rejects.toThrow(/ended/i);
  });

  it("rejects when the response has no body", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }));
    await expect(streamReply(replyReq, () => {})).rejects.toThrow(/body/i);
  });

  it("cancels the body once [DONE] arrives even if the server keeps the connection open", async () => {
    const cancel = vi.fn();
    fetchMock.mockResolvedValue(streamResponse(['data: {"delta":"a"}\n\ndata: [DONE]\n\n'], {}, cancel));
    await expect(streamReply(replyReq, () => {})).resolves.toBe("a");
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it("cancels the body when a streamed error arrives on an open connection", async () => {
    const cancel = vi.fn();
    fetchMock.mockResolvedValue(streamResponse(['data: {"error":"quota"}\n\n'], {}, cancel));
    await expect(streamReply(replyReq, () => {})).rejects.toThrow("quota");
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it("ignores deltas that arrive after [DONE]", async () => {
    fetchMock.mockResolvedValue(streamResponse(['data: {"delta":"a"}\n\ndata: [DONE]\n\ndata: {"delta":"b"}\n\n']));
    const text = await streamReply(replyReq, () => {});
    expect(text).toBe("a");
  });
});

describe("mock mode", () => {
  let api: Api;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.stubEnv("NEXT_PUBLIC_MOCK_API", "1");
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("fetch must not be called in mock mode"))));
    vi.resetModules();
    api = await import("@/lib/api");
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("analyze resolves the fixture after 1200 ms without touching fetch", async () => {
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
