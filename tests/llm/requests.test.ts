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
