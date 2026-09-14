import { NextResponse } from "next/server";
import type { ApiError } from "@/lib/types";

/** Largest request body either route accepts; the schemas' 4 M-char audio field plus JSON overhead fits under this. */
export const MAX_BODY_BYTES = 6_000_000;

/**
 * Cheap pre-check before `request.json()`: a declared `Content-Length` over the limit gets a
 * `413` without buffering the body. Absent or unparsable headers pass through (the schema
 * bounds still apply once parsed). Returns the response to send, or null to continue.
 */
export function requestTooLarge(request: Request): NextResponse<ApiError> | null {
  const header = request.headers.get("content-length");
  if (header === null) return null;
  const length = Number(header);
  if (!Number.isFinite(length) || length <= MAX_BODY_BYTES) return null;
  return NextResponse.json<ApiError>({ error: "Request too large" }, { status: 413 });
}
