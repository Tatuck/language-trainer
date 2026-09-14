import { describe, expect, it } from "vitest";
import { MAX_BODY_BYTES, requestTooLarge } from "@/lib/llm/body-limit";

function req(contentLength?: string) {
  const headers = new Headers();
  if (contentLength !== undefined) headers.set("content-length", contentLength);
  return new Request("http://x/api", { method: "POST", headers });
}

describe("requestTooLarge", () => {
  it("has a 6 MB ceiling", () => {
    expect(MAX_BODY_BYTES).toBe(6_000_000);
  });

  it("is null when Content-Length is absent", () => {
    expect(requestTooLarge(req())).toBeNull();
  });

  it("is null when Content-Length is at the limit", () => {
    expect(requestTooLarge(req(String(MAX_BODY_BYTES)))).toBeNull();
  });

  it("is null when Content-Length is not a number", () => {
    expect(requestTooLarge(req("abc"))).toBeNull();
  });

  it("returns a 413 JSON response when Content-Length exceeds the limit", async () => {
    const res = requestTooLarge(req(String(MAX_BODY_BYTES + 1)));
    expect(res).not.toBeNull();
    expect(res!.status).toBe(413);
    expect(await res!.json()).toEqual({ error: "Request too large" });
  });
});
