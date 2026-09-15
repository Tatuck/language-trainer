import type { HistoryMessage } from "@/lib/types";
import type { AudioContentPart, TextContentPart, UserContent } from "./content";

const MAX_HISTORY = 12;

/** The model call is stateless; only the most recent turns are sent with each reply. */
export function capHistory(history: HistoryMessage[]): HistoryMessage[] {
  return history.length > MAX_HISTORY ? history.slice(-MAX_HISTORY) : history;
}

export type PickUserMessageInput = {
  audio?: { wavBase64: string };
  text?: string;
  hint?: string;
  historyEmpty: boolean;
  sameModel: boolean;
};

export type PickUserMessageResult = { ok: true; content: UserContent } | { ok: false; error: string };

/**
 * Decides what the learner's new user-turn message is for the reply call:
 * audio (only when the chat model can accept it), else text, else the hint,
 * else ask the bot to open the conversation when there is no history yet,
 * else there is nothing to reply to.
 */
export function pickUserMessage(input: PickUserMessageInput): PickUserMessageResult {
  const { audio, text, hint, historyEmpty, sameModel } = input;
  if (audio && sameModel) {
    const parts: Array<AudioContentPart | TextContentPart> = [
      { type: "input_audio", input_audio: { data: audio.wavBase64, format: "wav" } },
    ];
    if (hint) parts.push({ type: "text", text: hint });
    return { ok: true, content: parts };
  }
  if (text) return { ok: true, content: text };
  if (hint) return { ok: true, content: hint };
  if (historyEmpty) return { ok: true, content: "Please start the conversation." };
  return { ok: false, error: "Nothing to reply to" };
}
