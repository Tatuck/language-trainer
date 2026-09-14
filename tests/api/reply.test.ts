import { beforeEach, describe, expect, it, vi } from "vitest";
import { APIError } from "openai";

const createMock = vi.fn();
const createClientMock = vi.fn(() => ({ chat: { completions: { create: createMock } } }));
const resolveModelsMock = vi.fn(() => ({ chat: "meta/muse-spark-1.3", audio: "google/gemini-3.8-flash" }));

vi.mock("@/lib/openrouter", () => ({
  createClient: () => createClientMock(),
  resolveModels: () => resolveModelsMock(),
}));

const { POST } = await import("@/app/api/turn/reply/route");

function req(body: unknown, rawBody?: string) {
  return new Request("http://x/api/turn/reply", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: rawBody ?? JSON.stringify(body),
  });
}

async function* chunks(contents: string[]) {
  for (const content of contents) {
    yield { choices: [{ delta: { content } }] };
  }
}

async function* erroringChunks() {
  yield { choices: [{ delta: { content: "Hi" } }] };
  throw new Error("network dropped");
}

async function* abortingChunks() {
  yield { choices: [{ delta: { content: "Hi" } }] };
  throw new DOMException("The operation was aborted", "AbortError");
}

/** Mimics the SDK's Stream: async-iterable with a `controller` whose abort() ends the iteration. */
function mockStream(contents: string[]) {
  const abort = vi.fn();
  let cancelled = false;
  const stream = {
    controller: {
      abort: () => {
        cancelled = true;
        abort();
      },
    },
    async *[Symbol.asyncIterator]() {
      for (const content of contents) {
        if (cancelled) return;
        await new Promise((r) => setTimeout(r, 5));
        yield { choices: [{ delta: { content } }] };
      }
    },
  };
  return { stream, abort };
}

beforeEach(() => {
  createMock.mockReset();
  createClientMock.mockReset();
  createClientMock.mockImplementation(() => ({ chat: { completions: { create: createMock } } }));
  resolveModelsMock.mockReset();
  resolveModelsMock.mockReturnValue({ chat: "meta/muse-spark-1.3", audio: "google/gemini-3.8-flash" });
});

describe("POST /api/turn/reply", () => {
  it("400s when the body fails validation", async () => {
    const res = await POST(req({ history: [], topic: "", level: "B1" }));
    expect(res.status).toBe(400);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("413s before reading the body when Content-Length exceeds 6 MB", async () => {
    const r = new Request("http://x/api", {
      method: "POST",
      headers: { "content-type": "application/json", "content-length": "6000001" },
      body: JSON.stringify({ history: [], topic: "Travelling in Japan", level: "B1" }),
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

  it("400s with 'Nothing to reply to' when there is history but no new input", async () => {
    const res = await POST(
      req({ history: [{ role: "assistant", content: "Hi, what's up?" }], topic: "Travel", level: "B1" })
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("Nothing to reply to");
    expect(createMock).not.toHaveBeenCalled();
  });

  it("streams deltas then [DONE] for a conversation opener", async () => {
    createMock.mockResolvedValueOnce(chunks(["Hello", " there!"]));
    const res = await POST(req({ history: [], topic: "Travelling in Japan", level: "B1" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/event-stream");
    expect(res.headers.get("cache-control")).toBe("no-cache");
    expect(res.headers.get("connection")).toBe("keep-alive");
    const text = await res.text();
    expect(text).toBe('data: {"delta":"Hello"}\n\n' + 'data: {"delta":" there!"}\n\n' + "data: [DONE]\n\n");

    const call = createMock.mock.calls[0][0];
    expect(call.model).toBe("meta/muse-spark-1.3");
    expect(call.stream).toBe(true);
    expect(call.reasoning_effort).toBe("low");
    expect(call.messages.at(-1)).toEqual({ role: "user", content: "Please start the conversation." });
  });

  it("passes the request's abort signal to the model call", async () => {
    createMock.mockResolvedValueOnce(chunks(["Hi"]));
    const r = req({ history: [], topic: "Travelling in Japan", level: "B1" });
    await POST(r);
    expect(createMock.mock.calls[0][1]).toEqual({ signal: r.signal });
  });

  it("aborts the upstream stream when the client cancels the response body", async () => {
    const { stream, abort } = mockStream(["one", "two", "three", "four"]);
    createMock.mockResolvedValueOnce(stream);
    const res = await POST(req({ history: [], topic: "Travelling in Japan", level: "B1" }));
    const reader = res.body!.getReader();
    const first = await reader.read();
    expect(new TextDecoder().decode(first.value)).toBe('data: {"delta":"one"}\n\n');
    await reader.cancel();
    expect(abort).toHaveBeenCalledTimes(1);
    await new Promise((r) => setTimeout(r, 40));
  });

  it("ends the stream without an error event when the upstream aborts", async () => {
    createMock.mockResolvedValueOnce(abortingChunks());
    const res = await POST(req({ history: [], topic: "Travelling in Japan", level: "B1" }));
    const text = await res.text();
    expect(text).toBe('data: {"delta":"Hi"}\n\n' + "data: [DONE]\n\n");
  });

  it("streams a user's text turn appended after the mapped history", async () => {
    createMock.mockResolvedValueOnce(chunks(["Sure!"]));
    const res = await POST(
      req({
        history: [
          { role: "user", content: "Hi" },
          { role: "assistant", content: "Hello, how are you?" },
        ],
        text: "I'm good, thanks",
        topic: "Travelling in Japan",
        level: "B1",
      })
    );
    expect(res.status).toBe(200);
    const call = createMock.mock.calls[0][0];
    expect(call.messages.slice(1)).toEqual([
      { role: "user", content: "Hi" },
      { role: "assistant", content: "Hello, how are you?" },
      { role: "user", content: "I'm good, thanks" },
    ]);
  });

  it("emits an error event then [DONE] when the upstream stream fails mid-way", async () => {
    createMock.mockResolvedValueOnce(erroringChunks());
    const res = await POST(req({ history: [], topic: "Travelling in Japan", level: "B1" }));
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toBe(
      'data: {"delta":"Hi"}\n\n' + 'data: {"error":"network dropped"}\n\n' + "data: [DONE]\n\n"
    );
  });

  it("returns a plain JSON 502 (not SSE) on an immediate upstream 5xx", async () => {
    createMock.mockRejectedValueOnce(new APIError(503, { message: "upstream down" }, "upstream down", new Headers()));
    const res = await POST(req({ history: [], topic: "Travelling in Japan", level: "B1" }));
    expect(res.status).toBe(502);
    expect(res.headers.get("content-type")).not.toBe("text/event-stream");
    const json = await res.json();
    expect(json.error).toMatch(/upstream down/i);
  });

  it("429s with the upstream message on an upstream 429", async () => {
    createMock.mockRejectedValueOnce(new APIError(429, { message: "rate limited" }, "rate limited", new Headers()));
    const res = await POST(req({ history: [], topic: "Travelling in Japan", level: "B1" }));
    expect(res.status).toBe(429);
    const json = await res.json();
    expect(json.error).toMatch(/rate limited/i);
  });

  it("502s with an auth hint (not the upstream text) on an upstream 403", async () => {
    createMock.mockRejectedValueOnce(new APIError(403, { message: "key revoked sk-or-abc" }, "key revoked sk-or-abc", new Headers()));
    const res = await POST(req({ history: [], topic: "Travelling in Japan", level: "B1" }));
    expect(res.status).toBe(502);
    const json = await res.json();
    expect(json.error).toMatch(/OPENROUTER_API_KEY/);
    expect(json.error).not.toMatch(/sk-or-abc/);
  });

  it("502s with a generic message on a non-SDK error", async () => {
    createMock.mockRejectedValueOnce(new TypeError("fetch failed"));
    const res = await POST(req({ history: [], topic: "Travelling in Japan", level: "B1" }));
    expect(res.status).toBe(502);
    const json = await res.json();
    expect(json.error).toBe("Unexpected error calling the model");
  });

  it("500s when the OpenRouter API key is missing", async () => {
    createClientMock.mockImplementationOnce(() => {
      throw new Error("OPENROUTER_API_KEY is not set. Copy .env.example to .env.local and fill it in.");
    });
    const res = await POST(req({ history: [], topic: "Travelling in Japan", level: "B1" }));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toMatch(/OPENROUTER_API_KEY/);
  });
});
