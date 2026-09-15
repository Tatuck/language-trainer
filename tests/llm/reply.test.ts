import { beforeEach, describe, expect, it, vi } from "vitest";
import { APIError } from "openai";
import { streamTutorReply } from "@/lib/llm/reply";
import type { ChatClient } from "@/lib/openrouter";
import type { ReplyRequest } from "@/lib/types";

const createMock = vi.fn();
const client = { chat: { completions: { create: createMock } } } as unknown as ChatClient;
const models = { chat: "meta/muse-spark-1.3", audio: "google/gemini-3.8-flash" };
const opener: ReplyRequest = { history: [], topic: "Travelling in Japan", level: "B1" };

async function* chunks(contents: (string | undefined)[]) {
  for (const content of contents) {
    yield { choices: [{ delta: { content } }] };
  }
}

async function* erroringChunks() {
  yield { choices: [{ delta: { content: "Hi" } }] };
  throw new Error("network dropped");
}

beforeEach(() => createMock.mockReset());

describe("streamTutorReply", () => {
  it("streams deltas for a conversation opener and resolves with the full text", async () => {
    createMock.mockResolvedValueOnce(chunks(["Hello", undefined, " there!"]));
    const deltas: string[] = [];
    await expect(streamTutorReply(client, models, opener, (d) => deltas.push(d))).resolves.toBe("Hello there!");
    expect(deltas).toEqual(["Hello", " there!"]);
    const call = createMock.mock.calls[0][0];
    expect(call.model).toBe(models.chat);
    expect(call.stream).toBe(true);
    expect(call.reasoning_effort).toBe("low");
    expect(call.messages[0].role).toBe("system");
    expect(call.messages.at(-1)).toEqual({ role: "user", content: "Please start the conversation." });
  });

  it("forwards the abort signal to the model call", async () => {
    createMock.mockResolvedValueOnce(chunks(["Hi"]));
    const ac = new AbortController();
    await streamTutorReply(client, models, opener, () => {}, ac.signal);
    expect(createMock.mock.calls[0][1]).toEqual({ signal: ac.signal });
  });

  it("appends the learner's text turn after the mapped history", async () => {
    createMock.mockResolvedValueOnce(chunks(["Sure!"]));
    await streamTutorReply(
      client,
      models,
      {
        history: [
          { role: "user", content: "Hi" },
          { role: "assistant", content: "Hello, how are you?" },
        ],
        text: "I'm good, thanks",
        topic: "Travelling in Japan",
        level: "B1",
      },
      () => {},
    );
    expect(createMock.mock.calls[0][0].messages.slice(1)).toEqual([
      { role: "user", content: "Hi" },
      { role: "assistant", content: "Hello, how are you?" },
      { role: "user", content: "I'm good, thanks" },
    ]);
  });

  it("sends audio only when the chat model is also the audio model", async () => {
    createMock.mockResolvedValue(chunks(["ok"]));
    const req: ReplyRequest = { ...opener, audio: { wavBase64: "UklGRg==" }, hint: "hello" };
    await streamTutorReply(client, models, req, () => {});
    expect(createMock.mock.calls[0][0].messages.at(-1).content).toMatch(/^Rough automatic transcript.*: hello$/);
    await streamTutorReply(client, { chat: models.audio, audio: models.audio }, req, () => {});
    const content = createMock.mock.calls[1][0].messages.at(-1).content;
    expect(content).toEqual([{ type: "input_audio", input_audio: { data: "UklGRg==", format: "wav" } }]);
  });

  it("rejects with 'Nothing to reply to' when there is history but no new input, without calling the model", async () => {
    const req: ReplyRequest = { history: [{ role: "assistant", content: "Hi, what's up?" }], topic: "Travel", level: "B1" };
    await expect(streamTutorReply(client, models, req, () => {})).rejects.toThrow("Nothing to reply to");
    expect(createMock).not.toHaveBeenCalled();
  });

  it("rejects when the stream fails mid-way, after forwarding what arrived", async () => {
    createMock.mockResolvedValueOnce(erroringChunks());
    const deltas: string[] = [];
    await expect(streamTutorReply(client, models, opener, (d) => deltas.push(d))).rejects.toThrow("network dropped");
    expect(deltas).toEqual(["Hi"]);
  });

  it("lets an immediate SDK error propagate untouched", async () => {
    const err = new APIError(503, { message: "upstream down" }, "upstream down", new Headers());
    createMock.mockRejectedValueOnce(err);
    await expect(streamTutorReply(client, models, opener, () => {})).rejects.toBe(err);
  });
});
