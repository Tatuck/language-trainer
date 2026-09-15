import { describe, expect, it } from "vitest";
import { APIConnectionError, APIError, APIUserAbortError } from "openai";
import { AUTH_FAILED_MESSAGE, isAbortError, upstreamErrorMessage } from "@/lib/llm/errors";

function apiError(status: number, message: string) {
  return new APIError(status, { message }, message, new Headers());
}

describe("upstreamErrorMessage", () => {
  it("replaces 401 and 403 with a fixed Settings hint, hiding the upstream text", () => {
    for (const status of [401, 403]) {
      const text = upstreamErrorMessage(apiError(status, "invalid key sk-or-abc"));
      expect(text).toBe(AUTH_FAILED_MESSAGE);
      expect(text).toMatch(/Settings/);
      expect(text).not.toMatch(/sk-or-abc/);
    }
  });

  it("passes other SDK errors through with their message", () => {
    expect(upstreamErrorMessage(apiError(429, "rate limited"))).toMatch(/rate limited/);
    expect(upstreamErrorMessage(apiError(503, "upstream down"))).toMatch(/upstream down/);
    expect(upstreamErrorMessage(new APIConnectionError({ message: "Connection error." }))).toBe("Connection error.");
  });

  it("uses the message of plain errors and a fallback for anything else", () => {
    expect(upstreamErrorMessage(new TypeError("fetch failed"))).toBe("fetch failed");
    expect(upstreamErrorMessage("boom")).toBe("Something went wrong.");
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
