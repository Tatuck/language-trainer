"use client";

import Link from "next/link";
import { startTransition, useEffect, useState } from "react";
import { VERDICT_UNDERLINE } from "@/components/verdict-underline";
import { errorText } from "@/lib/http";
import { buildNotebook, type NotebookEntry, type NotebookVerdict } from "@/lib/notebook";
import { loadAllSessions } from "@/lib/store";

type Filter = NotebookVerdict | "all";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "improve", label: "Could be better" },
  { value: "error", label: "Mistakes" },
];

const EMPTY_TEXT: Record<Filter, string> = {
  all: "Nothing to review yet. Sentences marked as mistakes or improvable land here after a session.",
  improve: "No sentences marked as improvable yet.",
  error: "No mistakes recorded yet.",
};

type Group = { sessionId: string; topic: string; date: string; entries: NotebookEntry[] };

/** Entries arrive ordered by session, so consecutive runs share a session. */
function groupBySession(entries: NotebookEntry[]): Group[] {
  const groups: Group[] = [];
  for (const entry of entries) {
    const last = groups[groups.length - 1];
    if (last && last.sessionId === entry.sessionId) last.entries.push(entry);
    else groups.push({ sessionId: entry.sessionId, topic: entry.topic, date: entry.date, entries: [entry] });
  }
  return groups;
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(date);
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

/** Every improvable or wrong sentence across the sessions in this browser, read after hydration. */
export function NotebookView() {
  const [filter, setFilter] = useState<Filter>("all");
  const [all, setAll] = useState<NotebookEntry[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadAllSessions().then(
      (sessions) => {
        if (!cancelled) startTransition(() => setAll(buildNotebook(sessions)));
      },
      (err: unknown) => {
        if (!cancelled) setLoadError(errorText(err));
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const entries = all === null ? [] : filter === "all" ? all : all.filter((e) => e.verdict === filter);
  const groups = groupBySession(entries);

  return (
    <main className="mx-auto w-full max-w-2xl px-4 pt-12 pb-16 sm:px-6 sm:pt-20">
      <header className="flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Notebook</h1>
        <Link
          href="/"
          className="shrink-0 text-sm text-zinc-500 underline-offset-4 hover:text-zinc-900 hover:underline dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          New session
        </Link>
      </header>
      <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
        {plural(entries.length, "sentence")} from {plural(groups.length, "session")}
      </p>

      <nav aria-label="Filter by verdict" className="mt-6 flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            aria-pressed={f.value === filter}
            onClick={() => setFilter(f.value)}
            className="text-zinc-500 underline-offset-4 hover:text-zinc-900 hover:underline aria-pressed:font-medium aria-pressed:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 dark:aria-pressed:text-zinc-100"
          >
            {f.label}
          </button>
        ))}
      </nav>

      {loadError !== null ? (
        <p role="alert" className="mt-12 text-sm text-zinc-500 dark:text-zinc-400">
          Could not load sessions: {loadError}
        </p>
      ) : all === null ? (
        <p className="mt-12 text-sm text-zinc-400 dark:text-zinc-500">Loading…</p>
      ) : groups.length === 0 ? (
        <section className="mt-12">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">{EMPTY_TEXT[filter]}</p>
          <Link href="/" className="mt-4 inline-block text-sm underline underline-offset-4">
            Start a session
          </Link>
        </section>
      ) : (
        <div className="mt-10 flex flex-col gap-12">
          {groups.map((group) => (
            <section key={group.sessionId} aria-labelledby={`session-${group.sessionId}`}>
              <h2
                id={`session-${group.sessionId}`}
                className="text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400"
              >
                <Link href={`/s?id=${encodeURIComponent(group.sessionId)}`} className="underline-offset-4 hover:underline">
                  {group.topic}
                </Link>
                <span className="ml-2 font-normal normal-case tracking-normal">{formatDate(group.date)}</span>
              </h2>
              <ul className="mt-3 divide-y divide-zinc-100 dark:divide-zinc-800">
                {group.entries.map((entry, i) => (
                  <li key={i} className="max-w-prose py-4 first:pt-0">
                    <p className="text-base leading-7 text-zinc-800 dark:text-zinc-200">
                      <span className={VERDICT_UNDERLINE[entry.verdict]}>{entry.text}</span>
                    </p>
                    {entry.correction && (
                      <p className="mt-1.5 text-sm font-semibold text-zinc-900 dark:text-zinc-100">{entry.correction}</p>
                    )}
                    {entry.alternatives.length > 0 && (
                      <ul className="mt-1.5 text-sm text-zinc-500 dark:text-zinc-400" aria-label="Other ways to say it">
                        {entry.alternatives.map((alt, j) => (
                          <li key={j}>{alt}</li>
                        ))}
                      </ul>
                    )}
                    {entry.issue && <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">{entry.issue}</p>}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
