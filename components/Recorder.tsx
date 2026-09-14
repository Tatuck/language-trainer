"use client";

// STUB from the ui lane. The audio lane owns the real components/Recorder.tsx; the integrator
// must replace this file with theirs. Kept to the documented props so the session page compiles.

export type RecorderProps = {
  disabled?: boolean;
  maxSeconds?: number;
  onInterim: (text: string) => void;
  onResult: (r: { wavBase64: string; hint: string | null; durationMs: number }) => void;
  onError: (message: string) => void;
};

export function Recorder({ disabled = false, onError }: RecorderProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-label="Record"
      aria-pressed={false}
      onClick={() => onError("Recorder not integrated yet")}
      className="flex size-11 shrink-0 items-center justify-center rounded-full border border-zinc-300 text-zinc-600 hover:border-zinc-500 hover:text-zinc-900 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-zinc-400 dark:hover:text-zinc-100"
    >
      <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.75">
        <rect x="9" y="3" width="6" height="12" rx="3" />
        <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
      </svg>
    </button>
  );
}

export default Recorder;
