"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[app] unhandled error", error);
  }, [error]);

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-20 sm:px-6">
      <h1 className="text-lg font-medium">Something went wrong</h1>
      <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">{error.message || "An unexpected error occurred."}</p>
      <div className="mt-6 flex gap-6 text-sm">
        <button type="button" onClick={reset} className="underline underline-offset-4">
          Try again
        </button>
        <Link href="/" className="underline underline-offset-4">
          Back to the start
        </Link>
      </div>
    </main>
  );
}
