import type { Analysis } from "./schema";
import type { FeedbackLang, Level } from "./prompts";

export type { Analysis, Level, FeedbackLang };

/** One learner utterance: what they said plus the model's analysis (null while pending). */
export type UserTurn = {
  role: "user";
  id: string;
  /** Browser interim/final transcript shown before analysis lands; replaced by analysis.transcript. */
  hint: string | null;
  analysis: Analysis | null;
  error: string | null;
};

export type BotTurn = {
  role: "bot";
  id: string;
  /** Reply text so far; may be partial when `error` is set. */
  text: string;
  /** True while tokens are still streaming in. */
  streaming: boolean;
  /** Why the reply stopped, or null when it completed (or is still streaming). */
  error: string | null;
};

export type Turn = UserTurn | BotTurn;

export type Session = {
  id: string;
  topic: string;
  level: Level;
  lang: FeedbackLang;
  createdAt: string; // ISO 8601
  turns: Turn[];
};

/** Plain-text history sent to the reply route; the API is stateless. */
export type HistoryMessage = { role: "user" | "assistant"; content: string };

/** Body of POST /api/turn/analyze. Exactly one of audio / text must be set. */
export type AnalyzeRequest = {
  audio?: { wavBase64: string };
  text?: string;
  hint?: string;
  level: Level;
  lang: FeedbackLang;
};

export type AnalyzeResponse = Analysis;

/**
 * Body of POST /api/turn/reply. Response is `text/event-stream`:
 *   data: {"delta":"partial text"}\n\n   (repeated)
 *   data: {"error":"message"}\n\n        (at most once, then stream ends)
 *   data: [DONE]\n\n
 * Audio is forwarded to the chat model only when it is the same model as the audio model;
 * otherwise the server uses `text`, falling back to `hint`. With neither (and no audio usable) → 400.
 * Empty `history` + no learner input = ask the bot to open the conversation.
 */
export type ReplyRequest = {
  audio?: { wavBase64: string };
  text?: string;
  hint?: string;
  history: HistoryMessage[];
  topic: string;
  level: Level;
};

export type ApiError = { error: string };
