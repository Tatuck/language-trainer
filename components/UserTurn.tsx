"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { mapSentencesToSpans } from "@/lib/schema";
import type { UserTurn as UserTurnData } from "@/lib/types";
import { SentencePopover } from "./SentencePopover";
import { VERDICT_UNDERLINE } from "./verdict-underline";

type Props = {
  turn: UserTurnData;
  /** Ghost turn shown while the microphone is still open. */
  listening?: boolean;
  /** Index of the sentence whose popover is open; the parent keeps a single open popover per page. */
  openIndex: number | null;
  onOpenChange: (index: number | null) => void;
};

type Anchor = { el: HTMLElement; top: number };

function anchorFor(el: HTMLElement, wrapper: HTMLElement): Anchor {
  const rects = el.getClientRects();
  const last = rects.length > 0 ? rects[rects.length - 1] : el.getBoundingClientRect();
  return { el, top: last.bottom - wrapper.getBoundingClientRect().top + 8 };
}

/** One learner utterance: pending states, then the analysed transcript with clickable sentences. */
export function UserTurn({ turn, listening = false, openIndex, onOpenChange }: Props) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const [openChip, setOpenChip] = useState<number | null>(null);
  const { analysis } = turn;

  // Keep the popover glued to its sentence when the text reflows.
  useEffect(() => {
    if (openIndex === null) return;
    function onResize() {
      const wrapper = wrapperRef.current;
      const el = wrapper?.querySelector<HTMLElement>(`[data-sentence="${openIndex}"]`);
      if (wrapper && el) setAnchor(anchorFor(el, wrapper));
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [openIndex]);

  function toggle(index: number, el: HTMLElement) {
    if (openIndex === index) {
      onOpenChange(null);
      return;
    }
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    setAnchor(anchorFor(el, wrapper));
    onOpenChange(index);
  }

  function onSentenceClick(index: number) {
    return (e: MouseEvent<HTMLSpanElement>) => toggle(index, e.currentTarget);
  }

  function onSentenceKey(index: number) {
    return (e: KeyboardEvent<HTMLSpanElement>) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
      toggle(index, e.currentTarget);
    };
  }

  const pending = analysis === null && turn.error === null;
  const hint = turn.hint?.trim() ?? "";

  return (
    <article className="max-w-prose">
      <p className="mb-1 flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
        You
        {analysis?.unclear && (
          <span className="rounded border border-zinc-300 px-1.5 py-px normal-case tracking-normal text-zinc-500 dark:border-zinc-600 dark:text-zinc-400">
            Audio was unclear
          </span>
        )}
      </p>

      {pending && (
        <p className="text-base italic leading-7 text-zinc-400 dark:text-zinc-500" aria-live="polite">
          {hint.length > 0 ? hint : listening ? "Listening…" : "Analysing…"}
          {hint.length > 0 && !listening && <span className="ml-2 text-xs not-italic">Analysing…</span>}
        </p>
      )}

      {!pending && analysis === null && (
        <>
          {hint.length > 0 && <p className="text-base leading-7 text-zinc-800 dark:text-zinc-200">{hint}</p>}
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400" role="status">
            {turn.error}
          </p>
        </>
      )}

      {analysis && (
        <div ref={wrapperRef} className="relative">
          <p className="text-base leading-7 text-zinc-800 dark:text-zinc-200">
            {mapSentencesToSpans(
              analysis.transcript,
              analysis.sentences.map((s) => s.text),
            ).map((span, i) =>
              span.sentenceIndex === null ? (
                <span key={i}>{span.text}</span>
              ) : (
                <span
                  key={i}
                  role="button"
                  tabIndex={0}
                  data-sentence={span.sentenceIndex}
                  aria-expanded={openIndex === span.sentenceIndex}
                  onClick={onSentenceClick(span.sentenceIndex)}
                  onKeyDown={onSentenceKey(span.sentenceIndex)}
                  className={`cursor-pointer rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-zinc-500 ${
                    VERDICT_UNDERLINE[analysis.sentences[span.sentenceIndex].verdict]
                  }`}
                >
                  {span.text}
                </span>
              ),
            )}
          </p>

          {openIndex !== null && anchor && analysis.sentences[openIndex] && (
            <SentencePopover
              sentence={analysis.sentences[openIndex]}
              top={anchor.top}
              anchor={anchor.el}
              onClose={() => onOpenChange(null)}
            />
          )}

          {analysis.pronunciation.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Pronunciation notes">
              {analysis.pronunciation.map((note, i) => (
                <li key={i}>
                  <button
                    type="button"
                    aria-expanded={openChip === i}
                    aria-controls={`${turn.id}-pron-${i}`}
                    onClick={() => setOpenChip(openChip === i ? null : i)}
                    className="rounded-full border border-zinc-300 px-2.5 py-0.5 text-xs text-zinc-600 hover:border-zinc-500 aria-expanded:border-zinc-500 aria-expanded:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-zinc-400 dark:aria-expanded:border-zinc-400 dark:aria-expanded:bg-zinc-800"
                  >
                    {note.said}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {analysis.pronunciation.map((note, i) => (
            <p
              key={i}
              id={`${turn.id}-pron-${i}`}
              hidden={openChip !== i}
              className="mt-1.5 text-sm text-zinc-600 dark:text-zinc-400"
            >
              <span className="font-medium text-zinc-800 dark:text-zinc-200">{note.issue}</span> {note.tip}
            </p>
          ))}

          {analysis.fluency && <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">{analysis.fluency}</p>}
        </div>
      )}
    </article>
  );
}
