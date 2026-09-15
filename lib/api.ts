import { analyzeTurn } from "./llm/analyze";
import { MISSING_KEY_MESSAGE, isAbortError, upstreamErrorMessage } from "./llm/errors";
import { streamTutorReply } from "./llm/reply";
import { createClient, type ChatClient } from "./openrouter";
import { AnalysisSchema } from "./schema";
import { hasApiKey, loadSettings, modelsFrom, type Models } from "./settings";
import type { Analysis, AnalyzeRequest, HistoryMessage, ReplyRequest, Turn } from "./types";
import mockAnalysis from "@/fixtures/analysis.json";

/** Set at build time by Next; `1` swaps the model calls for local fixtures so the UI runs without a key. */
export const MOCK_API = process.env.NEXT_PUBLIC_MOCK_API === "1";
const MOCK_ANALYZE_DELAY_MS = 1200;
const MOCK_WORD_DELAY_MS = 60;

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

/** Client + models from the stored settings; throws a Settings hint when there is no key yet. */
function live(): { client: ChatClient; models: Models } {
  const settings = loadSettings();
  if (!hasApiKey(settings)) throw new Error(MISSING_KEY_MESSAGE);
  return { client: createClient(settings.apiKey), models: modelsFrom(settings) };
}

/** Rethrows aborts untouched and everything else as an `Error` with display text. */
async function withDisplayErrors<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (err) {
    if (isAbortError(err)) throw err;
    throw new Error(upstreamErrorMessage(err));
  }
}

/** Send the learner's turn to the audio model and return the validated `Analysis`. */
export async function analyze(req: AnalyzeRequest, signal?: AbortSignal): Promise<Analysis> {
  if (MOCK_API) {
    await delay(MOCK_ANALYZE_DELAY_MS, signal);
    return AnalysisSchema.parse(mockAnalysis);
  }
  const { client, models } = live();
  return withDisplayErrors(() => analyzeTurn(client, models.audio, req, signal));
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

/** True while any turn is still waiting on a model: a streaming reply or an unanalysed learner turn. */
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
 * Stream the tutor's reply from the chat model, forward each delta to `onDelta`, and resolve
 * with the complete reply. Rejects with display text on any failure.
 */
export async function streamReply(
  req: ReplyRequest,
  onDelta: (t: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  if (MOCK_API) return mockStreamReply(req, onDelta, signal);
  const { client, models } = live();
  return withDisplayErrors(() => streamTutorReply(client, models, req, onDelta, signal));
}
