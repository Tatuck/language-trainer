import { describe, expect, it } from "vitest";
import { AnalyzeRequestSchema, ReplyRequestSchema } from "@/lib/llm/requests";

describe("AnalyzeRequestSchema", () => {
  it("accepts a valid audio request", () => {
    const result = AnalyzeRequestSchema.safeParse({
      audio: { wavBase64: "AAAA" },
      level: "B1",
      lang: "es",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a valid text request with an optional hint", () => {
    const result = AnalyzeRequestSchema.safeParse({
      text: "I go to the park yesterday.",
      hint: "I go to the park yesterday",
      level: "A2",
      lang: "en",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a request with neither audio nor text", () => {
    const result = AnalyzeRequestSchema.safeParse({ level: "B1", lang: "es" });
    expect(result.success).toBe(false);
  });

  it("rejects a request with both audio and text", () => {
    const result = AnalyzeRequestSchema.safeParse({
      audio: { wavBase64: "AAAA" },
      text: "hello",
      level: "B1",
      lang: "es",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid level", () => {
    const result = AnalyzeRequestSchema.safeParse({ text: "hi", level: "Z9", lang: "es" });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid feedback language", () => {
    const result = AnalyzeRequestSchema.safeParse({ text: "hi", level: "B1", lang: "fr" });
    expect(result.success).toBe(false);
  });

  it("rejects an empty wavBase64", () => {
    const result = AnalyzeRequestSchema.safeParse({ audio: { wavBase64: "" }, level: "B1", lang: "es" });
    expect(result.success).toBe(false);
  });
});

describe("ReplyRequestSchema", () => {
  it("accepts an empty history with just topic and level", () => {
    const result = ReplyRequestSchema.safeParse({ history: [], topic: "Travelling in Japan", level: "B1" });
    expect(result.success).toBe(true);
  });

  it("accepts a request with history, text and hint", () => {
    const result = ReplyRequestSchema.safeParse({
      history: [
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hi there" },
      ],
      text: "I want to talk about travel",
      hint: "I want to talk about travel",
      topic: "Travelling in Japan",
      level: "B2",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid role in history", () => {
    const result = ReplyRequestSchema.safeParse({
      history: [{ role: "bot", content: "hi" }],
      topic: "Travel",
      level: "B1",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an empty topic", () => {
    const result = ReplyRequestSchema.safeParse({ history: [], topic: "", level: "B1" });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid level", () => {
    const result = ReplyRequestSchema.safeParse({ history: [], topic: "Travel", level: "Z9" });
    expect(result.success).toBe(false);
  });
});

describe("request size limits", () => {
  const WAV_MAX = 4_000_000;
  const TEXT_MAX = 4000;
  const TOPIC_MAX = 200;
  const HISTORY_MAX = 50;

  it("accepts wavBase64 at the limit and rejects one byte over", () => {
    const at = { audio: { wavBase64: "A".repeat(WAV_MAX) }, level: "B1", lang: "es" };
    const over = { audio: { wavBase64: "A".repeat(WAV_MAX + 1) }, level: "B1", lang: "es" };
    expect(AnalyzeRequestSchema.safeParse(at).success).toBe(true);
    expect(AnalyzeRequestSchema.safeParse(over).success).toBe(false);
    expect(ReplyRequestSchema.safeParse({ ...at, history: [], topic: "T" }).success).toBe(true);
    expect(ReplyRequestSchema.safeParse({ ...over, history: [], topic: "T" }).success).toBe(false);
  });

  it("accepts text and hint at 4000 chars and rejects 4001", () => {
    const at = "x".repeat(TEXT_MAX);
    const over = "x".repeat(TEXT_MAX + 1);
    expect(AnalyzeRequestSchema.safeParse({ text: at, hint: at, level: "B1", lang: "es" }).success).toBe(true);
    expect(AnalyzeRequestSchema.safeParse({ text: over, level: "B1", lang: "es" }).success).toBe(false);
    expect(AnalyzeRequestSchema.safeParse({ text: "ok", hint: over, level: "B1", lang: "es" }).success).toBe(false);
    expect(ReplyRequestSchema.safeParse({ text: at, hint: at, history: [], topic: "T", level: "B1" }).success).toBe(true);
    expect(ReplyRequestSchema.safeParse({ text: over, history: [], topic: "T", level: "B1" }).success).toBe(false);
    expect(ReplyRequestSchema.safeParse({ hint: over, history: [], topic: "T", level: "B1" }).success).toBe(false);
  });

  it("accepts topic at 200 chars and rejects 201", () => {
    expect(ReplyRequestSchema.safeParse({ history: [], topic: "t".repeat(TOPIC_MAX), level: "B1" }).success).toBe(true);
    expect(ReplyRequestSchema.safeParse({ history: [], topic: "t".repeat(TOPIC_MAX + 1), level: "B1" }).success).toBe(false);
  });

  it("accepts 50 history entries and rejects 51", () => {
    const entry = { role: "user", content: "hi" };
    const at = Array.from({ length: HISTORY_MAX }, () => entry);
    expect(ReplyRequestSchema.safeParse({ history: at, topic: "T", level: "B1" }).success).toBe(true);
    expect(ReplyRequestSchema.safeParse({ history: [...at, entry], topic: "T", level: "B1" }).success).toBe(false);
  });

  it("accepts history content at 4000 chars and rejects 4001", () => {
    const ok = [{ role: "assistant", content: "c".repeat(TEXT_MAX) }];
    const bad = [{ role: "assistant", content: "c".repeat(TEXT_MAX + 1) }];
    expect(ReplyRequestSchema.safeParse({ history: ok, topic: "T", level: "B1" }).success).toBe(true);
    expect(ReplyRequestSchema.safeParse({ history: bad, topic: "T", level: "B1" }).success).toBe(false);
  });
});
