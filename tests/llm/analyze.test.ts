import { beforeEach, describe, expect, it, vi } from "vitest";
import { APIError } from "openai";
import { INVALID_ANALYSIS_MESSAGE, analyzeTurn } from "@/lib/llm/analyze";
import type { ChatClient } from "@/lib/openrouter";
import type { AnalyzeRequest } from "@/lib/types";

const createMock = vi.fn();
const client = { chat: { completions: { create: createMock } } } as unknown as ChatClient;
const MODEL = "google/gemini-3.8-flash";

function completion(content: string) {
  return { choices: [{ message: { content } }] };
}

const validAnalysis = {
  transcript: "Hello.",
  unclear: false,
  sentences: [{ text: "Hello.", verdict: "good", issue: null, correction: null, alternatives: [] }],
  pronunciation: [],
  fluency: null,
};

const textReq: AnalyzeRequest = { text: "Hello.", level: "B1", lang: "es" };

beforeEach(() => createMock.mockReset());

describe("analyzeTurn", () => {
  it("returns the parsed analysis on the first try, at low effort with the strict schema", async () => {
    createMock.mockResolvedValueOnce(completion(JSON.stringify(validAnalysis)));
    await expect(analyzeTurn(client, MODEL, textReq)).resolves.toEqual(validAnalysis);
    expect(createMock).toHaveBeenCalledTimes(1);
    const call = createMock.mock.calls[0][0];
    expect(call.model).toBe(MODEL);
    expect(call.reasoning_effort).toBe("low");
    expect(call.response_format).toMatchObject({ type: "json_schema", json_schema: { name: "analysis", strict: true } });
    expect(call.messages[0].role).toBe("system");
    expect(call.messages[1]).toEqual({ role: "user", content: "Analyse what I just wrote:\nHello." });
  });

  it("sends audio as an input_audio part with the hint in the instruction", async () => {
    createMock.mockResolvedValueOnce(completion(JSON.stringify(validAnalysis)));
    await analyzeTurn(client, MODEL, { audio: { wavBase64: "UklGRg==" }, hint: "hello", level: "A2", lang: "en" });
    const content = createMock.mock.calls[0][0].messages[1].content;
    expect(content[0]).toEqual({ type: "input_audio", input_audio: { data: "UklGRg==", format: "wav" } });
    expect(content[1].text).toMatch(/hint only.*hello/);
  });

  it("forwards the abort signal to the model call", async () => {
    createMock.mockResolvedValueOnce(completion(JSON.stringify(validAnalysis)));
    const ac = new AbortController();
    await analyzeTurn(client, MODEL, textReq, ac.signal);
    expect(createMock.mock.calls[0][1]).toEqual({ signal: ac.signal });
  });

  it("retries once at medium effort when the first answer is not valid JSON", async () => {
    createMock.mockResolvedValueOnce(completion("not json"));
    createMock.mockResolvedValueOnce(completion(JSON.stringify(validAnalysis)));
    await expect(analyzeTurn(client, MODEL, textReq)).resolves.toEqual(validAnalysis);
    expect(createMock).toHaveBeenCalledTimes(2);
    expect(createMock.mock.calls[1][0].reasoning_effort).toBe("medium");
  });

  it("gives up after two invalid analyses", async () => {
    createMock.mockResolvedValueOnce(completion("not json"));
    createMock.mockResolvedValueOnce(completion(JSON.stringify({ ...validAnalysis, sentences: "nope" })));
    await expect(analyzeTurn(client, MODEL, textReq)).rejects.toThrow(INVALID_ANALYSIS_MESSAGE);
    expect(createMock).toHaveBeenCalledTimes(2);
  });

  it("lets SDK errors propagate untouched", async () => {
    const err = new APIError(429, { message: "rate limited" }, "rate limited", new Headers());
    createMock.mockRejectedValueOnce(err);
    await expect(analyzeTurn(client, MODEL, textReq)).rejects.toBe(err);
    expect(createMock).toHaveBeenCalledTimes(1);
  });
});
