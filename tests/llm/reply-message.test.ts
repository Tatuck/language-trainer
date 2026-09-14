import { describe, expect, it } from "vitest";
import { capHistory, pickUserMessage } from "@/lib/llm/reply-message";
import type { HistoryMessage } from "@/lib/types";

describe("capHistory", () => {
  it("keeps history unchanged when at or under the limit", () => {
    const history: HistoryMessage[] = Array.from({ length: 12 }, (_, i) => ({
      role: i % 2 === 0 ? "user" : "assistant",
      content: `msg ${i}`,
    }));
    expect(capHistory(history)).toEqual(history);
  });

  it("keeps only the most recent 12 entries when longer", () => {
    const history: HistoryMessage[] = Array.from({ length: 15 }, (_, i) => ({
      role: "user",
      content: `msg ${i}`,
    }));
    const capped = capHistory(history);
    expect(capped).toHaveLength(12);
    expect(capped[0].content).toBe("msg 3");
    expect(capped[11].content).toBe("msg 14");
  });

  it("handles an empty history", () => {
    expect(capHistory([])).toEqual([]);
  });
});

describe("pickUserMessage", () => {
  it("uses audio + hint content parts when audio is present and chat === audio model", () => {
    const result = pickUserMessage({
      audio: { wavBase64: "AAAA" },
      hint: "hello",
      historyEmpty: false,
      sameModel: true,
    });
    expect(result).toEqual({
      ok: true,
      content: [
        { type: "input_audio", input_audio: { data: "AAAA", format: "wav" } },
        { type: "text", text: "hello" },
      ],
    });
  });

  it("omits the text part when audio is present without a hint", () => {
    const result = pickUserMessage({ audio: { wavBase64: "AAAA" }, historyEmpty: false, sameModel: true });
    expect(result).toEqual({
      ok: true,
      content: [{ type: "input_audio", input_audio: { data: "AAAA", format: "wav" } }],
    });
  });

  it("falls back to text when audio is present but models differ", () => {
    const result = pickUserMessage({
      audio: { wavBase64: "AAAA" },
      text: "Hello there",
      historyEmpty: false,
      sameModel: false,
    });
    expect(result).toEqual({ ok: true, content: "Hello there" });
  });

  it("uses text when there is no audio", () => {
    const result = pickUserMessage({ text: "Hello there", historyEmpty: false, sameModel: true });
    expect(result).toEqual({ ok: true, content: "Hello there" });
  });

  it("falls back to hint when there is no audio or text", () => {
    const result = pickUserMessage({ hint: "hello", historyEmpty: false, sameModel: true });
    expect(result).toEqual({ ok: true, content: "hello" });
  });

  it("asks the bot to open the conversation when history is empty and nothing else is given", () => {
    const result = pickUserMessage({ historyEmpty: true, sameModel: true });
    expect(result).toEqual({ ok: true, content: "Please start the conversation." });
  });

  it("returns an error when there is nothing to reply to and history is not empty", () => {
    const result = pickUserMessage({ historyEmpty: false, sameModel: true });
    expect(result).toEqual({ ok: false, error: "Nothing to reply to" });
  });
});
