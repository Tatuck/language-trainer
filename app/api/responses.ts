import { NextResponse } from "next/server";
import type { ZodError } from "zod";
import type { ApiError } from "@/lib/types";

/** JSON response helpers shared by every route under `app/api/`. */

export function badRequest(error: string): NextResponse<ApiError> {
  return NextResponse.json({ error }, { status: 400 });
}

/** 400 from a failed zod parse: the first issue's message, or `fallback` when there is none. */
export function validationError(error: ZodError, fallback = "Invalid request body"): NextResponse<ApiError> {
  return badRequest(error.issues[0]?.message ?? fallback);
}

export function notFound(): NextResponse<ApiError> {
  return NextResponse.json({ error: "Session not found" }, { status: 404 });
}

export function noContent(): Response {
  return new Response(null, { status: 204 });
}

/** Logs the failure with its route and answers a JSON 500; the DB layer throws on corrupt rows or I/O errors. */
export function serverError(route: string, err: unknown): NextResponse<ApiError> {
  console.error(`${route}: storage failed`, err);
  const message = err instanceof Error && err.message.length > 0 ? err.message : "Storage failed";
  return NextResponse.json({ error: message }, { status: 500 });
}

/** The request's JSON body, or the 400 to return directly when it is not valid JSON. */
export async function parseJsonBody(
  request: Request,
): Promise<{ ok: true; body: unknown } | { ok: false; response: NextResponse<ApiError> }> {
  try {
    return { ok: true, body: await request.json() };
  } catch {
    return { ok: false, response: badRequest("Request body must be valid JSON") };
  }
}
