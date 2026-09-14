import { describe, expect, it } from "vitest";
import {
  AnalysisSchema,
  analysisJsonSchema,
  mapSentencesToSpans,
} from "@/lib/schema";

const valid = {
  transcript: "I have 25 years. I am agree with you.",
  unclear: false,
  sentences: [
    {
      text: "I have 25 years.",
      verdict: "error",
      issue: "Calco del español: en inglés la edad se dice con 'to be'.",
      correction: "I'm 25 years old.",
      alternatives: ["I'm 25.", "I just turned 25."],
    },
    {
      text: "I am agree with you.",
      verdict: "error",
      issue: "'Agree' es verbo, no adjetivo.",
      correction: "I agree with you.",
      alternatives: ["I'm with you on that."],
    },
  ],
  pronunciation: [{ said: "years", issue: "sonó como 'jears'", tip: "La 'y' es suave, como en 'yes'." }],
  fluency: null,
};

describe("AnalysisSchema", () => {
  it("accepts a valid analysis", () => {
    const parsed = AnalysisSchema.parse(valid);
    expect(parsed.sentences[0].verdict).toBe("error");
  });

  it("rejects an unknown verdict", () => {
    const bad = { ...valid, sentences: [{ ...valid.sentences[0], verdict: "meh" }] };
    expect(() => AnalysisSchema.parse(bad)).toThrow();
  });

  it("caps pronunciation notes at 3", () => {
    const note = valid.pronunciation[0];
    const bad = { ...valid, pronunciation: [note, note, note, note] };
    expect(() => AnalysisSchema.parse(bad)).toThrow();
  });
});

describe("analysisJsonSchema", () => {
  it("is strict: no additional properties and every key required", () => {
    const s = analysisJsonSchema as { additionalProperties?: boolean; required?: string[]; properties: Record<string, unknown> };
    expect(s.additionalProperties).toBe(false);
    expect(s.required?.sort()).toEqual(Object.keys(s.properties).sort());
  });
});

describe("mapSentencesToSpans", () => {
  it("maps each sentence to its position in the transcript, in order", () => {
    const spans = mapSentencesToSpans(valid.transcript, valid.sentences.map((s) => s.text));
    expect(spans).toEqual([
      { text: "I have 25 years.", sentenceIndex: 0 },
      { text: " ", sentenceIndex: null },
      { text: "I am agree with you.", sentenceIndex: 1 },
    ]);
  });

  it("keeps unmatched text as plain spans and skips sentences it cannot place", () => {
    const spans = mapSentencesToSpans("Hello there, friend.", ["Hello there,", "nope"]);
    expect(spans).toEqual([
      { text: "Hello there,", sentenceIndex: 0 },
      { text: " friend.", sentenceIndex: null },
    ]);
  });

  it("matches case-insensitively when exact match fails", () => {
    const spans = mapSentencesToSpans("i think so.", ["I think so."]);
    expect(spans).toEqual([{ text: "i think so.", sentenceIndex: 0 }]);
  });
});
