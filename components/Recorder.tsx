"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { blobToWavBase64 } from "@/lib/audio/wav";
import { createLiveTranscriber, isSpeechRecognitionSupported, type LiveTranscriber } from "@/lib/audio/speech";
import { withTimeout } from "@/lib/audio/with-timeout";

/** How long to wait for the live transcriber's final text after stop() before sending the WAV without a hint. */
const TRANSCRIPT_GRACE_MS = 1500;

export type RecorderProps = {
  disabled?: boolean;
  maxSeconds?: number; // default 60; auto-stop
  onInterim: (text: string) => void; // live text while speaking (only when Web Speech is available)
  onResult: (r: { wavBase64: string; hint: string | null; durationMs: number }) => void;
  onError: (message: string) => void;
};

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") {
    return undefined;
  }
  return MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : undefined;
}

function describeError(err: unknown): string {
  if (err instanceof DOMException) {
    if (err.name === "NotAllowedError") return "Microphone permission was denied.";
    if (err.name === "NotFoundError" || err.name === "OverconstrainedError") return "No microphone was found.";
    return err.message || err.name;
  }
  if (err instanceof Error) return err.message;
  return "Could not start recording.";
}

export default function Recorder({ disabled = false, maxSeconds = 60, onInterim, onResult, onError }: RecorderProps) {
  const [recording, setRecording] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const mountedRef = useRef(true);
  const startingRef = useRef(false);
  /** Set once the current recording has fired onResult or onError; guarantees exactly one of them. */
  const settledRef = useRef(false);
  const streamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const transcriberRef = useRef<LiveTranscriber | null>(null);
  const blobPromiseRef = useRef<Promise<Blob> | null>(null);
  const transcriptPromiseRef = useRef<Promise<string | null> | null>(null);
  const startTimeRef = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const maxSecondsRef = useRef(maxSeconds);
  useEffect(() => {
    maxSecondsRef.current = maxSeconds;
  }, [maxSeconds]);

  const stopTracks = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const clearTimer = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const stopMediaRecorder = useCallback((mediaRecorder: MediaRecorder | null) => {
    if (!mediaRecorder) return;
    try {
      if (mediaRecorder.state !== "inactive") mediaRecorder.stop();
    } catch (err) {
      console.warn("MediaRecorder.stop() failed; continuing with the chunks captured so far", err);
    }
  }, []);

  const deliverResult = useCallback(
    (r: { wavBase64: string; hint: string | null; durationMs: number }) => {
      if (settledRef.current) return;
      settledRef.current = true;
      onResult(r);
    },
    [onResult]
  );

  const deliverError = useCallback(
    (message: string) => {
      if (settledRef.current) return;
      settledRef.current = true;
      onError(message);
    },
    [onError]
  );

  /** Releases everything held by the current recording and returns the button to idle. */
  const resetRecording = useCallback(() => {
    clearTimer();
    mediaRecorderRef.current = null;
    transcriberRef.current = null;
    blobPromiseRef.current = null;
    transcriptPromiseRef.current = null;
    stopTracks();
    if (mountedRef.current) {
      setRecording(false);
      setElapsedSeconds(0);
    }
  }, [clearTimer, stopTracks]);

  const stopRecording = useCallback(() => {
    clearTimer();
    transcriberRef.current?.stop();
    const mediaRecorder = mediaRecorderRef.current;
    const blobPromise = blobPromiseRef.current;
    const transcriptPromise = transcriptPromiseRef.current ?? Promise.resolve(null);
    if (!mediaRecorder || !blobPromise) return;
    // A second stop() while this one settles is a no-op.
    blobPromiseRef.current = null;

    stopMediaRecorder(mediaRecorder);

    const startedAt = startTimeRef.current;
    // The WAV must always reach onResult: a transcriber that never reports its final text
    // (engine ended without onend, tab lost focus) only costs the hint, not the turn.
    void Promise.all([blobPromise, withTimeout(transcriptPromise, TRANSCRIPT_GRACE_MS, null)])
      .then(async ([blob, hint]) => {
        const wavBase64 = await blobToWavBase64(blob);
        deliverResult({ wavBase64, hint, durationMs: Date.now() - startedAt });
      })
      .catch((err: unknown) => {
        deliverError(describeError(err));
      })
      .finally(resetRecording);
  }, [clearTimer, deliverError, deliverResult, resetRecording, stopMediaRecorder]);

  const startRecording = useCallback(async () => {
    if (startingRef.current || mediaRecorderRef.current) return;
    startingRef.current = true;
    settledRef.current = false;

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      startingRef.current = false;
      deliverError(describeError(err));
      return;
    }
    startingRef.current = false;
    if (!mountedRef.current) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }
    streamRef.current = stream;

    const mimeType = pickMimeType();
    const mediaRecorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    mediaRecorderRef.current = mediaRecorder;
    chunksRef.current = [];

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };

    blobPromiseRef.current = new Promise<Blob>((resolve) => {
      mediaRecorder.onstop = () => {
        stopTracks();
        resolve(new Blob(chunksRef.current, { type: mediaRecorder.mimeType || "audio/webm" }));
      };
    });

    mediaRecorder.onerror = (event) => {
      const cause = "error" in event && event.error instanceof Error ? event.error.message : "unknown error";
      console.error("MediaRecorder error", event);
      transcriberRef.current?.stop();
      stopMediaRecorder(mediaRecorder);
      deliverError(`Recording failed: ${cause}`);
      resetRecording();
    };

    if (isSpeechRecognitionSupported()) {
      transcriptPromiseRef.current = new Promise<string | null>((resolve) => {
        const transcriber = createLiveTranscriber({
          onInterim,
          onFinal: (text) => resolve(text.trim() ? text : null),
          // Fatal recognition errors still end in onFinal (see lib/audio/speech.ts), so the
          // promise settles there; the WAV is unaffected.
          onError: (err) => console.warn("Live transcription stopped", err),
        });
        transcriberRef.current = transcriber;
        transcriber?.start();
      });
    } else {
      transcriptPromiseRef.current = Promise.resolve(null);
    }

    startTimeRef.current = Date.now();
    try {
      mediaRecorder.start();
    } catch (err) {
      transcriberRef.current?.stop();
      deliverError(`Recording failed: ${describeError(err)}`);
      resetRecording();
      return;
    }
    setElapsedSeconds(0);
    setRecording(true);

    intervalRef.current = setInterval(() => {
      const seconds = Math.floor((Date.now() - startTimeRef.current) / 1000);
      setElapsedSeconds(seconds);
      if (seconds >= maxSecondsRef.current) {
        stopRecording();
      }
    }, 1000);
  }, [deliverError, onInterim, resetRecording, stopMediaRecorder, stopRecording, stopTracks]);

  const handleToggle = useCallback(() => {
    if (disabled) return;
    if (recording) {
      stopRecording();
    } else {
      void startRecording();
    }
  }, [disabled, recording, startRecording, stopRecording]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearTimer();
      transcriberRef.current?.stop();
      stopMediaRecorder(mediaRecorderRef.current);
      stopTracks();
    };
  }, [clearTimer, stopMediaRecorder, stopTracks]);

  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={recording}
      aria-label={recording ? "Stop recording" : "Start recording"}
      onClick={handleToggle}
      className={`relative flex h-16 w-16 items-center justify-center rounded-full border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 disabled:cursor-not-allowed disabled:opacity-50 ${
        recording
          ? "border-red-300 bg-red-50 text-red-600"
          : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50"
      }`}
    >
      {recording && (
        <span aria-hidden="true" className="absolute inset-0 animate-ping rounded-full bg-red-300/50" />
      )}
      <span className="relative z-10 text-sm font-medium tabular-nums">
        {recording ? `${elapsedSeconds}s` : <span aria-hidden="true" className="block h-5 w-5 rounded-full bg-red-500" />}
      </span>
    </button>
  );
}
