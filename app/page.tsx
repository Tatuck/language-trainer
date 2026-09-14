"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { startTransition, useCallback, useEffect, useState } from "react";
import { FEEDBACK_LANGS, LEVELS } from "@/lib/prompts";
import {
  createSession,
  deleteSession,
  loadSessions,
  migrateLocalStorage,
  saveSession,
  type SessionSummary,
} from "@/lib/store";
import { TOPICS } from "@/lib/topics";
import type { FeedbackLang, Level } from "@/lib/types";

const LANG_LABEL: Record<FeedbackLang, string> = { es: "Spanish", en: "English" };

const segment =
  "px-3 py-1.5 text-sm transition-colors aria-pressed:bg-zinc-900 aria-pressed:text-white dark:aria-pressed:bg-zinc-100 dark:aria-pressed:text-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 aria-pressed:hover:bg-zinc-900 dark:aria-pressed:hover:bg-zinc-100";

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function errorText(err: unknown): string {
  if (err instanceof Error && err.message.length > 0) return err.message;
  return "Something went wrong.";
}

export default function Home() {
  const router = useRouter();
  const [topicId, setTopicId] = useState<string | null>(null);
  const [custom, setCustom] = useState("");
  const [level, setLevel] = useState<Level>("B1");
  const [lang, setLang] = useState<FeedbackLang>("es");
  const [sessions, setSessions] = useState<SessionSummary[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const list = await loadSessions();
      startTransition(() => {
        setSessions(list);
        setListError(null);
      });
    } catch (err) {
      setListError(errorText(err));
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      // Sessions written by the old localStorage store are imported once, before the list is read.
      try {
        const imported = await migrateLocalStorage();
        if (!cancelled && imported > 0) setNotice(`Imported ${imported} ${imported === 1 ? "session" : "sessions"}`);
      } catch (err) {
        if (!cancelled) setNotice(`Could not import older sessions: ${errorText(err)}`);
      }
      if (!cancelled) await refresh();
    }
    void init();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  const customTopic = custom.trim();
  const presetTopic = TOPICS.find((t) => t.id === topicId)?.title ?? null;
  const topic = customTopic.length > 0 ? customTopic : presetTopic;

  function pickTopic(id: string) {
    setTopicId(id);
    setCustom("");
  }

  async function start() {
    if (!topic || starting) return;
    const session = createSession({ topic, level, lang });
    setStarting(true);
    try {
      await saveSession(session);
    } catch (err) {
      setStarting(false);
      setNotice(`Could not start the session: ${errorText(err)}`);
      return;
    }
    router.push(`/s/${session.id}`);
  }

  async function remove(id: string) {
    try {
      await deleteSession(id);
    } catch (err) {
      setNotice(`Could not delete the session: ${errorText(err)}`);
      return;
    }
    await refresh();
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-4 pt-12 pb-16 sm:px-6 sm:pt-20">
      <header className="flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">LanguageTrainer</h1>
        <Link
          href="/notebook"
          className="shrink-0 text-sm text-zinc-500 underline-offset-4 hover:text-zinc-900 hover:underline dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          Notebook
        </Link>
      </header>
      <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
        Pick a topic, talk, and get your English corrected sentence by sentence.
      </p>
      {notice && (
        <p role="status" className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">
          {notice}
        </p>
      )}

      <section className="mt-10" aria-labelledby="topic-heading">
        <h2 id="topic-heading" className="text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          Topic
        </h2>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {TOPICS.map((t) => (
            <button
              key={t.id}
              type="button"
              aria-pressed={topicId === t.id && customTopic.length === 0}
              onClick={() => pickTopic(t.id)}
              className="rounded-md border border-zinc-200 px-3 py-2.5 text-left transition-colors hover:border-zinc-400 aria-pressed:border-zinc-900 aria-pressed:bg-zinc-50 dark:border-zinc-800 dark:hover:border-zinc-600 dark:aria-pressed:border-zinc-100 dark:aria-pressed:bg-zinc-900"
            >
              <span className="block text-sm font-medium">{t.title}</span>
              <span className="mt-0.5 block text-xs leading-snug text-zinc-500 dark:text-zinc-400">{t.hint}</span>
            </button>
          ))}
        </div>
        <label className="mt-3 block">
          <span className="sr-only">Custom topic</span>
          <input
            type="text"
            name="topic"
            value={custom}
            onChange={(e) => {
              setCustom(e.target.value);
              if (e.target.value.trim().length > 0) setTopicId(null);
            }}
            placeholder="Custom…"
            className="w-full rounded-md border border-zinc-200 bg-transparent px-3 py-2.5 text-sm placeholder:text-zinc-400 focus:border-zinc-500 focus:outline-none dark:border-zinc-800 dark:placeholder:text-zinc-500 dark:focus:border-zinc-400"
          />
        </label>
      </section>

      <div className="mt-8 flex flex-wrap gap-x-10 gap-y-6">
        <section aria-labelledby="level-heading">
          <h2 id="level-heading" className="text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            Level
          </h2>
          <div role="group" aria-label="Level" className="mt-3 inline-flex overflow-hidden rounded-md border border-zinc-300 dark:border-zinc-700">
            {LEVELS.map((l) => (
              <button
                key={l}
                type="button"
                aria-pressed={level === l}
                onClick={() => setLevel(l)}
                className={`${segment} border-r border-zinc-300 last:border-r-0 dark:border-zinc-700`}
              >
                {l}
              </button>
            ))}
          </div>
        </section>

        <section aria-labelledby="lang-heading">
          <h2 id="lang-heading" className="text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            Feedback in
          </h2>
          <div role="group" aria-label="Feedback language" className="mt-3 inline-flex overflow-hidden rounded-md border border-zinc-300 dark:border-zinc-700">
            {FEEDBACK_LANGS.map((l) => (
              <button
                key={l}
                type="button"
                aria-pressed={lang === l}
                onClick={() => setLang(l)}
                className={`${segment} border-r border-zinc-300 last:border-r-0 dark:border-zinc-700`}
              >
                {LANG_LABEL[l]}
              </button>
            ))}
          </div>
        </section>
      </div>

      <button
        type="button"
        onClick={() => void start()}
        disabled={!topic || starting}
        className="mt-10 w-full rounded-md bg-zinc-900 px-4 py-3 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto sm:px-8 dark:bg-zinc-100 dark:text-zinc-900"
      >
        Start
      </button>

      <section className="mt-16" aria-labelledby="previous-heading">
        <h2 id="previous-heading" className="text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          Previous sessions
        </h2>
        {listError !== null ? (
          <p role="alert" className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
            Could not load sessions: {listError}{" "}
            <button type="button" onClick={() => void refresh()} className="underline underline-offset-4">
              Retry
            </button>
          </p>
        ) : sessions === null ? (
          <p className="mt-3 text-sm text-zinc-400 dark:text-zinc-500">Loading…</p>
        ) : sessions.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">No sessions yet. Start one above.</p>
        ) : (
          <ul className="mt-3 divide-y divide-zinc-200 dark:divide-zinc-800">
            {sessions.map((s) => {
              const turns = s.turnCount;
              return (
                <li key={s.id} className="flex items-center justify-between gap-4 py-3">
                  <Link href={`/s/${s.id}`} className="group min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium group-hover:underline group-hover:underline-offset-4">
                      {s.topic}
                    </span>
                    <span className="mt-0.5 block text-xs text-zinc-500 dark:text-zinc-400">
                      {formatDate(s.createdAt)} · {s.level} · {turns} {turns === 1 ? "turn" : "turns"}
                    </span>
                  </Link>
                  <button
                    type="button"
                    onClick={() => void remove(s.id)}
                    aria-label={`Delete session about ${s.topic}`}
                    className="shrink-0 text-xs text-zinc-400 underline-offset-4 hover:text-zinc-900 hover:underline dark:hover:text-zinc-100"
                  >
                    Delete
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
