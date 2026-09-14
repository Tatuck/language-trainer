import { beforeEach, describe, expect, it, vi } from "vitest";
import { APIError } from "openai";

const createMock = vi.fn();
const createClientMock = vi.fn(() => ({ chat: { completions: { create: createMock } } }));
const resolveModelsMock = vi.fn(() => ({ chat: "meta/muse-spark-1.3", audio: "google/gemini-3.8-flash" }));

vi.mock("@/lib/openrouter", () => ({
  createClient: () => createClientMock(),
  resolveModels: () => resolveModelsMock(),
}));

const { POST } = await import("@/app/api/turn/analyze/route");

function req(body: unknown, rawBody?: string) {
  return new Request("http://x/api/turn/analyze", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: rawBody ?? JSON.stringify(body),
  });
}

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

beforeEach(() => {
  createMock.mockReset();
  createClientMock.mockReset();
  createClientMock.mockImplementation(() => ({ chat: { completions: { create: createMock } } }));
  resolveModelsMock.mockReset();
  resolveModelsMock.mockReturnValue({ chat: "meta/muse-spark-1.3", audio: "google/gemini-3.8-flash" });
});

describe("POST /api/turn/analyze", () => {
  it("400s when the body fails validation", async () => {
    const res = await POST(req({ level: "B1", lang: "es" }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(typeof json.error).toBe("string");
    expect(createMock).not.toHaveBeenCalled();
  });

  it("413s before reading the body when Content-Length exceeds 6 MB", async () => {
    const r = new Request("http://x/api", {
      method: "POST",
      headers: { "content-type": "application/json", "content-length": "6000001" },
      body: JSON.stringify({ text: "Hello.", level: "B1", lang: "es" }),
    });
    const res = await POST(r);
    expect(res.status).toBe(413);
    const json = await res.json();
    expect(json.error).toBe("Request too large");
    expect(createMock).not.toHaveBeenCalled();
  });

  it("400s on malformed JSON", async () => {
    const res = await POST(req(undefined, "not json"));
    expect(res.status).toBe(400);
  });

  it("returns 200 with the parsed analysis on the first try", async () => {
    createMock.mockResolvedValueOnce(completion(JSON.stringify(validAnalysis)));
    const res = await POST(req({ text: "Hello.", level: "B1", lang: "es" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual(validAnalysis);
    expect(createMock).toHaveBeenCalledTimes(1);
    const call = createMock.mock.calls[0][0];
    expect(call.model).toBe("google/gemini-3.8-flash");
    expect(call.reasoning_effort).toBe("low");
  });

  it("retries once with medium effort and succeeds", async () => {
    createMock.mockResolvedValueOnce(completion("not json"));
    createMock.mockResolvedValueOnce(completion(JSON.stringify(validAnalysis)));
    const res = await POST(req({ text: "Hello.", level: "B1", lang: "es" }));
    expect(res.status).toBe(200);
    expect(createMock).toHaveBeenCalledTimes(2);
    expect(createMock.mock.calls[1][0].reasoning_effort).toBe("medium");
  });

  it("502s after two invalid analyses", async () => {
    createMock.mockResolvedValueOnce(completion("not json"));
    createMock.mockResolvedValueOnce(completion(JSON.stringify({ ...validAnalysis, sentences: "nope" })));
    const res = await POST(req({ text: "Hello.", level: "B1", lang: "es" }));
    expect(res.status).toBe(502);
    const json = await res.json();
    expect(json.error).toMatch(/invalid analysis/i);
    expect(createMock).toHaveBeenCalledTimes(2);
  });

  it("502s with the upstream message on an OpenAI APIError", async () => {
    createMock.mockRejectedValueOnce(new APIError(429, { message: "rate limited" }, "rate limited", new Headers()));
    const res = await POST(req({ text: "Hello.", level: "B1", lang: "es" }));
    expect(res.status).toBe(502);
    const json = await res.json();
    expect(json.error).toMatch(/rate limited/i);
  });

  it("500s when the OpenRouter API key is missing", async () => {
    createClientMock.mockImplementationOnce(() => {
      throw new Error("OPENROUTER_API_KEY is not set. Copy .env.example to .env.local and fill it in.");
    });
    const res = await POST(req({ text: "Hello.", level: "B1", lang: "es" }));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toMatch(/OPENROUTER_API_KEY/);
    expect(createMock).not.toHaveBeenCalled();
  });
});
