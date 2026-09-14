import { describe, expect, it } from "vitest";
import { APIConnectionError, APIError, APIUserAbortError } from "openai";
import { AUTH_FAILED_MESSAGE, isAbortError, upstreamErrorResponse } from "@/lib/llm/upstream-error";

function apiError(status: number, message: string) {
  return new APIError(status, { message }, message, new Headers());
}

describe("upstreamErrorResponse", () => {
  it("keeps 429 as 429 with the upstream message", async () => {
    const res = upstreamErrorResponse(apiError(429, "rate limited"));
    expect(res.status).toBe(429);
    expect((await res.json()).error).toMatch(/rate limited/);
  });

  it("maps 5xx to 502 with the upstream message", async () => {
    const res = upstreamErrorResponse(apiError(503, "upstream down"));
    expect(res.status).toBe(502);
    expect((await res.json()).error).toMatch(/upstream down/);
  });

  it("maps 401 and 403 to 502 with a fixed auth hint, hiding the upstream message", async () => {
    for (const status of [401, 403]) {
      const res = upstreamErrorResponse(apiError(status, "secret-bearing detail"));
      expect(res.status).toBe(502);
      const json = await res.json();
      expect(json.error).toBe(AUTH_FAILED_MESSAGE);
      expect(json.error).toMatch(/OPENROUTER_API_KEY/);
      expect(json.error).not.toMatch(/secret/);
    }
  });

  it("maps other 4xx to 502 with the upstream message", async () => {
    const res = upstreamErrorResponse(apiError(400, "bad model"));
    expect(res.status).toBe(502);
    expect((await res.json()).error).toMatch(/bad model/);
  });

  it("maps status-less SDK errors (connection, abort) to 502 with their message", async () => {
    const res = upstreamErrorResponse(new APIConnectionError({ message: "Connection error." }));
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "Connection error." });
  });

  it("maps non-SDK errors to a generic 502", async () => {
    const res = upstreamErrorResponse(new TypeError("boom"));
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "Unexpected error calling the model" });
  });
});

describe("isAbortError", () => {
  it("recognises the SDK's user-abort error", () => {
    expect(isAbortError(new APIUserAbortError())).toBe(true);
  });

  it("recognises a DOMException / Error named AbortError", () => {
    expect(isAbortError(new DOMException("aborted", "AbortError"))).toBe(true);
    expect(isAbortError(Object.assign(new Error("x"), { name: "AbortError" }))).toBe(true);
  });

  it("rejects other errors and non-errors", () => {
    expect(isAbortError(new Error("network dropped"))).toBe(false);
    expect(isAbortError(apiError(500, "x"))).toBe(false);
    expect(isAbortError(null)).toBe(false);
    expect(isAbortError("AbortError")).toBe(false);
  });
});
