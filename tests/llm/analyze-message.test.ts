import { describe, expect, it } from "vitest";
import { buildAnalyzeUserContent } from "@/lib/llm/analyze-message";

describe("buildAnalyzeUserContent", () => {
  it("builds an audio + instruction content array when audio is present", () => {
    const content = buildAnalyzeUserContent({ audio: { wavBase64: "AAAA" } });
    expect(content).toEqual([
      { type: "input_audio", input_audio: { data: "AAAA", format: "wav" } },
      { type: "text", text: "Analyse what I just said." },
    ]);
  });

  it("appends the hint to the instruction text when audio and hint are both present", () => {
    const content = buildAnalyzeUserContent({ audio: { wavBase64: "AAAA" }, hint: "hello there" });
    expect(content).toEqual([
      { type: "input_audio", input_audio: { data: "AAAA", format: "wav" } },
      {
        type: "text",
        text: "Analyse what I just said.\nRough automatic transcript (hint only, audio is the truth): hello there",
      },
    ]);
  });

  it("builds a plain text instruction when only text is present", () => {
    const content = buildAnalyzeUserContent({ text: "I go to the park yesterday." });
    expect(content).toBe("Analyse what I just wrote:\nI go to the park yesterday.");
  });

  it("ignores hint when text is used instead of audio", () => {
    const content = buildAnalyzeUserContent({ text: "Hello", hint: "should be ignored" });
    expect(content).toBe("Analyse what I just wrote:\nHello");
  });
});
