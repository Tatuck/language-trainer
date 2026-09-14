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
  text: string;
  /** True while tokens are still streaming in. */
  streaming: boolean;
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

/** Body of POST /api/turn/reply. Streams `text/event-stream`; each event `data:` is a text delta, final event `data: [DONE]`. */
export type ReplyRequest = {
  audio?: { wavBase64: string };
  text?: string;
  hint?: string;
  history: HistoryMessage[];
  topic: string;
  level: Level;
};

export type ApiError = { error: string };
