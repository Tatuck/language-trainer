/** Shared browser-side helpers for turning a failed fetch, or any caught error, into display text. */

/** Message from a non-2xx JSON response: its `{error}` string when present, else the status text. */
async function responseErrorMessage(res: Response): Promise<string> {
  const fallback = res.statusText || `HTTP ${res.status}`;
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return fallback;
  }
  if (typeof body === "object" && body !== null && typeof (body as { error?: unknown }).error === "string") {
    return (body as { error: string }).error;
  }
  return fallback;
}

/** Throws an `Error` built from `responseErrorMessage(res)` when `res` is not ok; a no-op otherwise. */
export async function throwIfNotOk(res: Response): Promise<void> {
  if (res.ok) return;
  throw new Error(await responseErrorMessage(res));
}

/** A caught value's message for display, or a generic fallback when there is none. */
export function errorText(err: unknown): string {
  if (err instanceof Error && err.message.length > 0) return err.message;
  return "Something went wrong.";
}
