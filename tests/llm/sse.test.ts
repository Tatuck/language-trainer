import { describe, expect, it } from "vitest";
import { sseEvent } from "@/lib/llm/sse";

describe("sseEvent", () => {
  it("encodes a delta payload as a data event", () => {
    expect(sseEvent({ delta: "hi" })).toBe('data: {"delta":"hi"}\n\n');
  });

  it("encodes an error payload as a data event", () => {
    expect(sseEvent({ error: "oops" })).toBe('data: {"error":"oops"}\n\n');
  });

  it("encodes the literal [DONE] sentinel without JSON-quoting it", () => {
    expect(sseEvent("[DONE]")).toBe("data: [DONE]\n\n");
  });

  it("escapes special characters inside JSON payloads", () => {
    expect(sseEvent({ delta: 'line\nwith "quotes"' })).toBe(
      'data: {"delta":"line\\nwith \\"quotes\\""}\n\n'
    );
  });
});
