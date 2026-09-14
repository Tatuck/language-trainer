import { describe, expect, it } from "vitest";
import { TOPICS } from "@/lib/topics";

describe("TOPICS", () => {
  it("has exactly 10 topics with unique ids", () => {
    expect(TOPICS).toHaveLength(10);
    expect(new Set(TOPICS.map((t) => t.id)).size).toBe(10);
  });

  it("every topic has a non-empty id, title and hint", () => {
    for (const t of TOPICS) {
      expect(t.id).toMatch(/^[a-z][a-z0-9-]*$/);
      expect(t.title.trim().length).toBeGreaterThan(0);
      expect(t.hint.trim().length).toBeGreaterThan(0);
    }
  });

  it("covers the everyday subjects from the brief", () => {
    const titles = TOPICS.map((t) => t.title.toLowerCase()).join(" | ");
    for (const word of ["travel", "food", "work", "hobbies", "film", "weekend", "city", "technology", "sport", "childhood"]) {
      expect(titles).toContain(word);
    }
  });
});
