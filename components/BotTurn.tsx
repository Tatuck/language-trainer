"use client";

import { useEffect, useRef } from "react";
import type { BotTurn as BotTurnData } from "@/lib/types";
import { speak, stopSpeaking, useTtsEnabled } from "@/lib/tts";

type Props = {
  turn: BotTurnData;
};

/**
 * One reply from the tutor: plain text, with a blinking caret while it streams. A reply that
 * stopped early keeps whatever text arrived and shows why underneath, muted.
 */
export function BotTurn({ turn }: Props) {
  const [ttsEnabled] = useTtsEnabled();
  // Speak only on the streaming → done transition, never for turns restored from storage.
  const wasStreaming = useRef(turn.streaming);
  useEffect(() => {
    if (wasStreaming.current && !turn.streaming && ttsEnabled && turn.error === null) {
      speak(turn.text);
    }
    wasStreaming.current = turn.streaming;
  }, [turn.streaming, turn.text, turn.error, ttsEnabled]);
  // A new reply starting, or leaving the page, silences whatever is still being read.
  useEffect(() => {
    if (turn.streaming) stopSpeaking();
    return stopSpeaking;
  }, [turn.streaming]);
  return (
    <article aria-live="polite" aria-busy={turn.streaming}>
      <p className="mb-1 text-[11px] font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500">Tutor</p>
      {(turn.text.length > 0 || turn.streaming) && (
        <p className="whitespace-pre-wrap text-base leading-7 text-zinc-800 dark:text-zinc-200">
          {turn.text}
          {turn.streaming && (
            <span
              aria-hidden="true"
              className="ml-px inline-block h-[1.05em] w-0.5 translate-y-[0.18em] animate-[caret-blink_1s_steps(1)_infinite] bg-zinc-500 dark:bg-zinc-400"
            />
          )}
        </p>
      )}
      {turn.error !== null && (
        <p role="alert" className="mt-1 text-sm italic text-zinc-500 dark:text-zinc-400">
          {turn.error}
        </p>
      )}
    </article>
  );
}
