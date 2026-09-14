"use client";

import { useEffect, useRef, useState } from "react";
import type { Sentence, Verdict } from "@/lib/schema";

const VERDICT_LABEL: Record<Verdict, string> = {
  good: "Natural",
  improve: "Could be better",
  error: "Mistake",
};

const VERDICT_DOT: Record<Verdict, string> = {
  good: "bg-emerald-500/50",
  improve: "bg-amber-500",
  error: "bg-red-500",
};

type Props = {
  sentence: Sentence;
  /** Offset from the top of the positioned wrapper, in px (just below the clicked sentence). */
  top: number;
  /** The sentence element that opened the popover; clicks on it are not "outside". */
  anchor: HTMLElement | null;
  onClose: () => void;
};

/** Details for one sentence, anchored under it. Esc or a click outside closes it. */
export function SentencePopover({ sentence, top, anchor, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    function onPointerDown(e: PointerEvent) {
      const target = e.target;
      if (!(target instanceof Node)) return;
      if (ref.current?.contains(target) || anchor?.contains(target)) return;
      onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [anchor, onClose]);

  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
  }, []);

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={`${VERDICT_LABEL[sentence.verdict]}: ${sentence.text}`}
      tabIndex={-1}
      style={{ top }}
      className="absolute left-0 z-10 w-full max-w-md rounded-md border border-zinc-200 bg-white p-4 text-sm shadow-sm outline-none dark:border-zinc-700 dark:bg-zinc-900"
    >
      <div className="flex items-start justify-between gap-3">
        <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          <span aria-hidden="true" className={`inline-block size-2 rounded-full ${VERDICT_DOT[sentence.verdict]}`} />
          {VERDICT_LABEL[sentence.verdict]}
        </p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="-m-1 rounded p-1 text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
        >
          <svg aria-hidden="true" viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M3 3l10 10M13 3L3 13" />
          </svg>
        </button>
      </div>

      {sentence.issue && <p className="mt-2 text-zinc-600 dark:text-zinc-400">{sentence.issue}</p>}
      {sentence.correction && <p className="mt-2 font-semibold text-zinc-900 dark:text-zinc-100">{sentence.correction}</p>}
      {sentence.verdict === "good" && !sentence.issue && !sentence.correction && (
        <p className="mt-2 text-zinc-600 dark:text-zinc-400">Nothing to fix here.</p>
      )}

      {sentence.alternatives.length > 0 && (
        <div className="mt-3">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Other ways to say it</p>
          <ul className="mt-1 divide-y divide-zinc-100 dark:divide-zinc-800">
            {sentence.alternatives.map((alt) => (
              <Alternative key={alt} text={alt} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

type CopyState = "idle" | "copied" | "selected" | "failed";

function selectContents(el: HTMLElement | null): boolean {
  const selection = window.getSelection();
  if (!el || !selection) return false;
  const range = document.createRange();
  range.selectNodeContents(el);
  selection.removeAllRanges();
  selection.addRange(range);
  return true;
}

function Alternative({ text }: { text: string }) {
  const textRef = useRef<HTMLSpanElement>(null);
  const [state, setState] = useState<CopyState>("idle");

  useEffect(() => {
    if (state === "idle") return;
    const timer = setTimeout(() => setState("idle"), 1800);
    return () => clearTimeout(timer);
  }, [state]);

  async function copy() {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(text);
        setState("copied");
        return;
      } catch (err) {
        console.warn("[popover] clipboard write failed, selecting text instead", err);
      }
    }
    setState(selectContents(textRef.current) ? "selected" : "failed");
  }

  const label = state === "copied" ? "Copied" : state === "selected" ? "Selected" : state === "failed" ? "Could not copy" : "Copy";

  return (
    <li className="flex items-center justify-between gap-3 py-1.5">
      <span ref={textRef} className="text-zinc-800 dark:text-zinc-200">
        {text}
      </span>
      <button
        type="button"
        onClick={copy}
        aria-label={`Copy "${text}"`}
        className="shrink-0 text-xs text-zinc-500 underline-offset-4 hover:text-zinc-900 hover:underline dark:text-zinc-400 dark:hover:text-zinc-100"
      >
        {label}
      </button>
    </li>
  );
}
