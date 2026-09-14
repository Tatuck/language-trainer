import { NextResponse } from "next/server";
import { APIError, APIUserAbortError } from "openai";
import type { ApiError } from "@/lib/types";

/** Shown instead of the upstream 401/403 text, which may echo key fragments or account details. */
export const AUTH_FAILED_MESSAGE = "Upstream authentication failed; check OPENROUTER_API_KEY";

/**
 * Status policy shared by both routes for a failed model call: a 429 is passed through
 * (the client can back off and retry); anything else becomes a 502. Callers log the real
 * error server-side before calling this.
 */
export function upstreamErrorResponse(err: unknown): NextResponse<ApiError> {
  if (!(err instanceof APIError)) {
    return NextResponse.json<ApiError>({ error: "Unexpected error calling the model" }, { status: 502 });
  }
  if (err.status === 429) {
    return NextResponse.json<ApiError>({ error: err.message }, { status: 429 });
  }
  const message = err.status === 401 || err.status === 403 ? AUTH_FAILED_MESSAGE : err.message;
  return NextResponse.json<ApiError>({ error: message }, { status: 502 });
}

/** True for the SDK's abort error and for any spec-style `AbortError` (e.g. the client disconnected). */
export function isAbortError(err: unknown): boolean {
  if (err instanceof APIUserAbortError) return true;
  return typeof err === "object" && err !== null && "name" in err && err.name === "AbortError";
}
