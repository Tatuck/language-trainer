import type { Metadata } from "next";
import { Suspense } from "react";
import { SessionView } from "./SessionView";

export const metadata: Metadata = { title: "Session · LanguageTrainer" };

/** `useSearchParams` needs a Suspense boundary so the static export can prerender the shell. */
export default function SessionPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto w-full max-w-2xl px-4 py-20 text-sm text-zinc-400 sm:px-6 dark:text-zinc-500">Loading…</main>
      }
    >
      <SessionView />
    </Suspense>
  );
}
