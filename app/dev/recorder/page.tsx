"use client";

import { useState } from "react";
import Recorder from "@/components/Recorder";

type Result = { wavBase64: string; hint: string | null; durationMs: number };

export default function RecorderDevPage() {
  const [interim, setInterim] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-6 p-8 font-sans">
      <h1 className="text-xl font-semibold text-zinc-900">Recorder dev harness</h1>
      <p className="text-sm text-zinc-500">
        Click the button (or press Space while it is focused) to start recording, click again to stop.
      </p>

      <Recorder
        maxSeconds={60}
        onInterim={(text) => setInterim(text)}
        onResult={(r) => {
          setError(null);
          setResult(r);
        }}
        onError={(message) => {
          setError(message);
          setResult(null);
        }}
      />

      <p className="min-h-[1.5rem] text-sm italic text-zinc-500">{interim || "(live transcript appears here)"}</p>

      {error && <p className="text-sm text-red-600">Error: {error}</p>}

      {result && (
        <div className="flex flex-col gap-2 rounded border border-zinc-200 p-4 text-sm text-zinc-700">
          <p>duration: {result.durationMs} ms</p>
          <p>base64 length: {result.wavBase64.length}</p>
          <p>hint: {result.hint ?? "(none)"}</p>
          <audio controls src={`data:audio/wav;base64,${result.wavBase64}`} />
        </div>
      )}
    </main>
  );
}
