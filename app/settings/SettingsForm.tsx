"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { errorText } from "@/lib/http";
import { checkApiKey } from "@/lib/openrouter";
import {
  DEFAULT_AUDIO_MODEL,
  DEFAULT_CHAT_MODEL,
  DEFAULT_SETTINGS,
  MODEL_SUGGESTIONS,
  saveSettings,
  type Settings,
} from "@/lib/settings";
import { useStoredSettings } from "@/lib/use-settings";

const field =
  "mt-1.5 w-full rounded-md border border-zinc-200 bg-transparent px-3 py-2 text-sm placeholder:text-zinc-400 focus:border-zinc-500 focus:outline-none dark:border-zinc-800 dark:placeholder:text-zinc-500 dark:focus:border-zinc-400";
const label = "block text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400";
const secondary =
  "text-sm text-zinc-500 underline-offset-4 hover:text-zinc-900 hover:underline disabled:cursor-not-allowed disabled:opacity-40 dark:text-zinc-400 dark:hover:text-zinc-100";

function money(n: number): string {
  return `$${n.toFixed(2)}`;
}

export function SettingsForm() {
  const stored = useStoredSettings();
  /** The learner's unsaved edits; null means "show what is stored". */
  const [edits, setEdits] = useState<Settings | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [status, setStatus] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [checking, setChecking] = useState(false);
  const checkRef = useRef<AbortController | null>(null);

  const loaded = stored !== null;
  const draft = edits ?? stored ?? DEFAULT_SETTINGS;

  useEffect(() => () => checkRef.current?.abort(), []);

  function update(patch: Partial<Settings>) {
    setStatus(null);
    setEdits({ ...draft, ...patch });
  }

  function save() {
    try {
      const saved = saveSettings(draft);
      setEdits(saved);
      setStatus({ kind: "ok", text: saved.apiKey ? "Saved." : "Saved. Without a key you can only browse past sessions." });
    } catch (err) {
      setStatus({ kind: "error", text: errorText(err) });
    }
  }

  async function check() {
    checkRef.current?.abort();
    const controller = new AbortController();
    checkRef.current = controller;
    setChecking(true);
    setStatus(null);
    try {
      const info = await checkApiKey(draft.apiKey, controller.signal);
      const parts = ["Key accepted"];
      if (info.label) parts.push(`(${info.label})`);
      if (info.usage !== null) parts.push(`· spent ${money(info.usage)}${info.limit !== null ? ` of ${money(info.limit)}` : ""}`);
      setStatus({ kind: "ok", text: `${parts.join(" ")}.` });
    } catch (err) {
      if (!controller.signal.aborted) setStatus({ kind: "error", text: errorText(err) });
    } finally {
      if (checkRef.current === controller) setChecking(false);
    }
  }

  const keyEmpty = draft.apiKey.trim().length === 0;

  return (
    <main className="mx-auto w-full max-w-2xl px-4 pt-12 pb-16 sm:px-6 sm:pt-20">
      <header className="flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <Link href="/" className={secondary}>
          Back
        </Link>
      </header>
      <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
        This app has no server. Your key and your sessions stay in this browser&apos;s local storage; the key is sent
        only to openrouter.ai, with each request you make.
      </p>

      <form
        className="mt-10 flex flex-col gap-8"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <section>
          <label htmlFor="apiKey" className={label}>
            OpenRouter API key
          </label>
          <div className="flex items-center gap-3">
            <input
              id="apiKey"
              type={showKey ? "text" : "password"}
              autoComplete="off"
              spellCheck={false}
              value={draft.apiKey}
              onChange={(e) => update({ apiKey: e.target.value })}
              placeholder="sk-or-v1-…"
              disabled={!loaded}
              className={field}
            />
            <button type="button" onClick={() => setShowKey((v) => !v)} className={`${secondary} mt-1.5 shrink-0`}>
              {showKey ? "Hide" : "Show"}
            </button>
          </div>
          <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
            Create one at{" "}
            <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer" className="underline underline-offset-4">
              openrouter.ai/keys
            </a>
            . A few cents per conversation; set a spending limit on the key if you like.
          </p>
        </section>

        <section>
          <label htmlFor="audioModel" className={label}>
            Audio model
          </label>
          <input
            id="audioModel"
            type="text"
            list="model-suggestions"
            autoComplete="off"
            spellCheck={false}
            value={draft.audioModel}
            onChange={(e) => update({ audioModel: e.target.value })}
            placeholder={DEFAULT_AUDIO_MODEL}
            disabled={!loaded}
            className={field}
          />
          <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
            Transcribes and analyses what you say. Must accept audio input (the Gemini models do).
          </p>
        </section>

        <section>
          <label htmlFor="chatModel" className={label}>
            Chat model
          </label>
          <input
            id="chatModel"
            type="text"
            list="model-suggestions"
            autoComplete="off"
            spellCheck={false}
            value={draft.chatModel}
            onChange={(e) => update({ chatModel: e.target.value })}
            placeholder={DEFAULT_CHAT_MODEL}
            disabled={!loaded}
            className={field}
          />
          <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
            Writes the tutor&apos;s replies. Any{" "}
            <a href="https://openrouter.ai/models" target="_blank" rel="noreferrer" className="underline underline-offset-4">
              OpenRouter model id
            </a>{" "}
            works; blank fields fall back to the defaults.
          </p>
        </section>

        <datalist id="model-suggestions">
          {MODEL_SUGGESTIONS.map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>

        {status && (
          <p role={status.kind === "error" ? "alert" : "status"} className="text-sm text-zinc-600 dark:text-zinc-300">
            {status.text}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <button
            type="submit"
            disabled={!loaded}
            className="rounded-md bg-zinc-900 px-6 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
          >
            Save
          </button>
          <button type="button" onClick={() => void check()} disabled={!loaded || keyEmpty || checking} className={secondary}>
            {checking ? "Checking…" : "Check key"}
          </button>
          <button
            type="button"
            onClick={() => update({ apiKey: "", chatModel: DEFAULT_CHAT_MODEL, audioModel: DEFAULT_AUDIO_MODEL })}
            disabled={!loaded}
            className={secondary}
          >
            Reset
          </button>
        </div>
      </form>
    </main>
  );
}
