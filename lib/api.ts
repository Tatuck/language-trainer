import { AnalysisSchema } from "./schema";
import type { Analysis, AnalyzeRequest, HistoryMessage, ReplyRequest, Turn } from "./types";
import mockAnalysis from "@/fixtures/analysis.json";

/** Set at build time by Next; `1` swaps the network calls for local fixtures so the UI runs without the routes. */
const MOCK = process.env.NEXT_PUBLIC_MOCK_API === "1";
const MOCK_ANALYZE_DELAY_MS = 1200;
const MOCK_WORD_DELAY_MS = 60;

export type SseEvent =
  | { type: "delta"; delta: string }
  | { type: "error"; error: string }
  | { type: "done" };

export type SseParser = {
  /** Feed the next chunk of the stream; returns every event completed by it (possibly none). */
  push(chunk: string): SseEvent[];
  /** Drain a trailing event that never received its terminating blank line. */
  flush(): SseEvent[];
};

function parseEvent(block: string): SseEvent | null {
  const dataLines: string[] = [];
  for (const line of block.split("\n")) {
    if (!line.startsWith("data:")) continue; // comments (`:`), `event:`, `id:`, `retry:` carry nothing for us
    let value = line.slice("data:".length);
    if (value.startsWith(" ")) value = value.slice(1);
    dataLines.push(value);
  }
  if (dataLines.length === 0) return null;
  const data = dataLines.join("\n");
  if (data === "[DONE]") return { type: "done" };
  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    return { type: "error", error: `Malformed SSE data: ${data.slice(0, 80)}` };
  }
  if (typeof parsed === "object" && parsed !== null) {
    const o = parsed as Record<string, unknown>;
    if (typeof o.error === "string") return { type: "error", error: o.error };
    if (typeof o.delta === "string") return { type: "delta", delta: o.delta };
  }
  return { type: "error", error: `Unexpected SSE payload: ${data.slice(0, 80)}` };
}

/**
 * Incremental parser for the `text/event-stream` body of `/api/turn/reply`
 * (format documented on `ReplyRequest` in `lib/types.ts`). Pure: no I/O, no timers.
 */
export function parseSseChunks(): SseParser {
  let buffer = "";
  return {
    push(chunk) {
      // Normalise after concatenating so a CRLF split across chunks still collapses.
      buffer = (buffer + chunk).replace(/\r\n/g, "\n");
      const events: SseEvent[] = [];
      let sep = buffer.indexOf("\n\n");
      while (sep !== -1) {
        const event = parseEvent(buffer.slice(0, sep));
        buffer = buffer.slice(sep + 2);
        if (event) events.push(event);
        sep = buffer.indexOf("\n\n");
      }
      return events;
    },
    flush() {
      const rest = buffer;
      buffer = "";
      if (rest.trim().length === 0) return [];
      const event = parseEvent(rest);
      return event ? [event] : [];
    },
  };
}

function abortError(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException("The operation was aborted.", "AbortError");
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError(signal));
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError(signal as AbortSignal));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

async function errorMessage(res: Response): Promise<string> {
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

function postJson(url: string, body: unknown, signal?: AbortSignal): Promise<Response> {
  return fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
}

/** POST the learner's turn to `/api/turn/analyze` and return the validated `Analysis`. */
export async function analyze(req: AnalyzeRequest, signal?: AbortSignal): Promise<Analysis> {
  if (MOCK) {
    await delay(MOCK_ANALYZE_DELAY_MS, signal);
    return AnalysisSchema.parse(mockAnalysis);
  }
  const res = await postJson("/api/turn/analyze", req, signal);
  if (!res.ok) throw new Error(await errorMessage(res));
  const json: unknown = await res.json();
  return AnalysisSchema.parse(json);
}

/**
 * Plain-text conversation so far for `ReplyRequest.history`: only completed turns, learner
 * turns as the analysed transcript (or the browser hint when analysis failed).
 * Pending turns (analysis still running, bot still streaming) and bot turns that ended in an
 * error (their text is partial at best) are left out.
 */
export function historyFromTurns(turns: Turn[]): HistoryMessage[] {
  const history: HistoryMessage[] = [];
  for (const turn of turns) {
    if (turn.role === "bot") {
      if (turn.streaming || turn.error !== null || turn.text.length === 0) continue;
      history.push({ role: "assistant", content: turn.text });
      continue;
    }
    if (turn.analysis === null && turn.error === null) continue;
    const content = (turn.analysis?.transcript ?? turn.hint ?? "").trim();
    if (content.length === 0) continue;
    history.push({ role: "user", content });
  }
  return history;
}

/** True while any turn is still waiting on the server: a streaming reply or an unanalysed learner turn. */
export function hasPendingTurn(turns: Turn[]): boolean {
  return turns.some((t) => (t.role === "bot" ? t.streaming : t.analysis === null && t.error === null));
}

function isOpener(req: ReplyRequest): boolean {
  return req.history.length === 0 && !req.audio && !req.text;
}

function mockReplyText(req: ReplyRequest): string {
  if (isOpener(req)) {
    return `Hello, nice to meet you. Our topic today is "${req.topic}", so what comes to mind first?`;
  }
  return "That sounds interesting, and I see what you mean. What made you feel that way?";
}

async function mockStreamReply(req: ReplyRequest, onDelta: (t: string) => void, signal?: AbortSignal): Promise<string> {
  const words = mockReplyText(req).split(" ");
  let text = "";
  for (let i = 0; i < words.length; i++) {
    await delay(MOCK_WORD_DELAY_MS, signal);
    const piece = i < words.length - 1 ? `${words[i]} ` : words[i];
    text += piece;
    onDelta(piece);
  }
  return text;
}

/**
 * POST to `/api/turn/reply`, forward each streamed delta to `onDelta`, and resolve with the
 * complete reply once `[DONE]` arrives. Rejects on a non-2xx status, a streamed `{error}`,
 * or a stream that closes before `[DONE]`.
 */
export async function streamReply(
  req: ReplyRequest,
  onDelta: (t: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  if (MOCK) return mockStreamReply(req, onDelta, signal);

  const res = await postJson("/api/turn/reply", req, signal);
  if (!res.ok) throw new Error(await errorMessage(res));
  if (!res.body) throw new Error("Reply response has no body");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const parser = parseSseChunks();
  let text = "";

  /** Apply events in order; true once `[DONE]` was seen. Throws on a streamed error. */
  const apply = (events: SseEvent[]): boolean => {
    for (const event of events) {
      if (event.type === "done") return true;
      if (event.type === "error") throw new Error(event.error);
      text += event.delta;
      onDelta(event.delta);
    }
    return false;
  };

  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      let complete: boolean;
      try {
        complete = apply(parser.push(decoder.decode(value, { stream: true })));
      } catch (err) {
        // The server said it failed; stop consuming so the connection is released, then surface it.
        await reader.cancel();
        throw err;
      }
      if (complete) {
        await reader.cancel();
        return text;
      }
    }
  } finally {
    reader.releaseLock();
  }
  if (apply(parser.push(decoder.decode()))) return text;
  if (apply(parser.flush())) return text;
  throw new Error("Reply stream ended before it was complete");
}
