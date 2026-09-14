"use client";

import Link from "next/link";
import type { Level } from "@/lib/types";
import { useTtsEnabled, useTtsSupported } from "@/lib/tts";

type Props = { topic: string; level: Level };

export function SessionHeader({ topic, level }: Props) {
  const ttsSupported = useTtsSupported();
  const [ttsEnabled, setTtsEnabled] = useTtsEnabled();
  return (
    <header className="border-b border-zinc-200 dark:border-zinc-800">
      <div className="mx-auto flex w-full max-w-2xl items-baseline justify-between gap-4 px-4 py-3 sm:px-6">
        <div className="min-w-0">
          <h1 className="truncate text-base font-medium">{topic}</h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Level {level}</p>
        </div>
        <div className="flex shrink-0 items-baseline gap-4">
          {ttsSupported && (
            <button
              type="button"
              aria-pressed={ttsEnabled}
              onClick={() => setTtsEnabled(!ttsEnabled)}
              className={`text-sm underline-offset-4 hover:underline ${
                ttsEnabled
                  ? "text-zinc-900 dark:text-zinc-100"
                  : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
              }`}
            >
              {ttsEnabled ? "Read aloud: on" : "Read aloud: off"}
            </button>
          )}
          <Link
            href="/"
            className="text-sm text-zinc-500 underline-offset-4 hover:text-zinc-900 hover:underline dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            New session
          </Link>
        </div>
      </div>
    </header>
  );
}
