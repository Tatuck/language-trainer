import type { BotTurn as BotTurnData } from "@/lib/types";

type Props = {
  turn: BotTurnData;
  /** True when `turn.text` holds an error message instead of a reply. */
  failed?: boolean;
};

/** One reply from the tutor: plain text, with a blinking caret while it streams. */
export function BotTurn({ turn, failed = false }: Props) {
  return (
    <article aria-live="polite" aria-busy={turn.streaming}>
      <p className="mb-1 text-[11px] font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500">Tutor</p>
      <p
        className={
          failed
            ? "text-sm italic text-zinc-500 dark:text-zinc-400"
            : "whitespace-pre-wrap text-base leading-7 text-zinc-800 dark:text-zinc-200"
        }
      >
        {turn.text}
        {turn.streaming && (
          <span
            aria-hidden="true"
            className="ml-px inline-block h-[1.05em] w-0.5 translate-y-[0.18em] animate-[caret-blink_1s_steps(1)_infinite] bg-zinc-500 dark:bg-zinc-400"
          />
        )}
      </p>
    </article>
  );
}
