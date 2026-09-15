import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-20 sm:px-6">
      <h1 className="text-lg font-medium">Page not found</h1>
      <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">There is nothing at this address.</p>
      <Link href="/" className="mt-6 inline-block text-sm underline underline-offset-4">
        Back to the start
      </Link>
    </main>
  );
}
