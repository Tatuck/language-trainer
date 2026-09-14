import { NextResponse } from "next/server";
import { createClient } from "@/lib/openrouter";
import type { ApiError } from "@/lib/types";

type ClientResult =
  | { ok: true; client: ReturnType<typeof createClient> }
  | { ok: false; response: NextResponse<ApiError> };

/** `createClient()`, turned into a logged 500 response when OpenRouter is misconfigured. */
export function createClientOrError(route: string): ClientResult {
  try {
    return { ok: true, client: createClient() };
  } catch (err) {
    console.error(`${route}: cannot create OpenRouter client`, err);
    const message = err instanceof Error ? err.message : "Server misconfigured";
    return { ok: false, response: NextResponse.json<ApiError>({ error: message }, { status: 500 }) };
  }
}
