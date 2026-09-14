import { NextResponse } from "next/server";
import type { ApiError } from "@/lib/types";

export function badRequest(error: string): NextResponse<ApiError> {
  return NextResponse.json({ error }, { status: 400 });
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
