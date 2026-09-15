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

/** Plain-text conversation so far, sent with every reply request; the model call is stateless. */
export type HistoryMessage = { role: "user" | "assistant"; content: string };

/** One learner turn for the audio model. Exactly one of audio / text must be set. */
export type AnalyzeRequest = {
  audio?: { wavBase64: string };
  text?: string;
  hint?: string;
  level: Level;
  lang: FeedbackLang;
};

/**
 * One learner turn for the chat model.
 * Audio is forwarded only when the chat model is also the audio model; otherwise `text` is used,
 * falling back to `hint`. With neither (and no audio usable) the call is rejected.
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
