import { describe, expect, it } from "vitest";
import { analyzerSystem, tutorSystem, type Level, type FeedbackLang } from "@/lib/prompts";

describe("analyzerSystem", () => {
  it("mentions the learner level and the feedback language", () => {
    const p = analyzerSystem({ level: "B1", lang: "es" });
    expect(p).toContain("B1");
    expect(p).toMatch(/Spanish/);
  });

  it("writes explanations in English when lang is en", () => {
    const p = analyzerSystem({ level: "B2", lang: "en" });
    expect(p).toMatch(/explanations?.*in English/i);
  });
});

describe("tutorSystem", () => {
  it("includes topic and level, and asks for a closing question", () => {
    const p = tutorSystem({ topic: "Travelling in Japan", level: "A2" });
    expect(p).toContain("Travelling in Japan");
    expect(p).toContain("A2");
    expect(p).toMatch(/question/i);
  });
});

describe("types", () => {
  it("exports Level and FeedbackLang unions", () => {
    const l: Level = "C1";
    const f: FeedbackLang = "es";
    expect([l, f]).toEqual(["C1", "es"]);
  });
});
