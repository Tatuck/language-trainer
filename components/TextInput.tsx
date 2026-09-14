"use client";

import { useState, type FormEvent } from "react";

type Props = {
  disabled?: boolean;
  onSend: (text: string) => void;
};

/** Typed fallback for the recorder: single line, Enter or the button sends. */
export function TextInput({ disabled = false, onSend }: Props) {
  const [value, setValue] = useState("");
  const trimmed = value.trim();

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (disabled || trimmed.length === 0) return;
    onSend(trimmed);
    setValue("");
  }

  return (
    <form onSubmit={submit} className="flex min-w-0 flex-1 items-center gap-2">
      <input
        type="text"
        name="message"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={disabled}
        placeholder="Or type what you would say"
        aria-label="Type what you would say"
        autoComplete="off"
        enterKeyHint="send"
        className="min-w-0 flex-1 rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm placeholder:text-zinc-400 focus:border-zinc-500 focus:outline-none disabled:opacity-50 dark:border-zinc-700 dark:placeholder:text-zinc-500 dark:focus:border-zinc-400"
      />
      <button
        type="submit"
        disabled={disabled || trimmed.length === 0}
        className="shrink-0 rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:border-zinc-500 hover:text-zinc-900 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-zinc-400 dark:hover:text-zinc-100"
      >
        Send
      </button>
    </form>
  );
}
