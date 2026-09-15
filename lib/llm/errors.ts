import { APIError, APIUserAbortError } from "openai";
import { errorText } from "@/lib/http";

export const MISSING_KEY_MESSAGE = "Add your OpenRouter API key in Settings.";

/** Shown instead of the upstream 401/403 text, which may echo key fragments or account details. */
export const AUTH_FAILED_MESSAGE = "OpenRouter rejected the API key. Check it in Settings.";

/** Display text for a failed model call: a fixed hint for auth failures, the error's own message otherwise. */
export function upstreamErrorMessage(err: unknown): string {
  if (err instanceof APIError && (err.status === 401 || err.status === 403)) return AUTH_FAILED_MESSAGE;
  return errorText(err);
}

/** True for the SDK's abort error and for any spec-style `AbortError`. */
export function isAbortError(err: unknown): boolean {
  if (err instanceof APIUserAbortError) return true;
  return typeof err === "object" && err !== null && "name" in err && err.name === "AbortError";
}
