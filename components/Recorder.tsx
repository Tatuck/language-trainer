"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { blobToWavBase64 } from "@/lib/audio/wav";
import { createLiveTranscriber, isSpeechRecognitionSupported, type LiveTranscriber } from "@/lib/audio/speech";

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

  const stopRecording = useCallback(() => {
    clearTimer();
    transcriberRef.current?.stop();
    mediaRecorderRef.current?.stop();

    const blobPromise = blobPromiseRef.current;
    const transcriptPromise = transcriptPromiseRef.current ?? Promise.resolve(null);
    if (!blobPromise) return;

    const startedAt = startTimeRef.current;
    void Promise.all([blobPromise, transcriptPromise])
      .then(async ([blob, hint]) => {
        const wavBase64 = await blobToWavBase64(blob);
        onResult({ wavBase64, hint, durationMs: Date.now() - startedAt });
      })
      .catch((err: unknown) => {
        onError(describeError(err));
      })
      .finally(() => {
        mediaRecorderRef.current = null;
        transcriberRef.current = null;
        blobPromiseRef.current = null;
        transcriptPromiseRef.current = null;
        setRecording(false);
        setElapsedSeconds(0);
      });
  }, [clearTimer, onError, onResult]);

  const startRecording = useCallback(async () => {
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      onError(describeError(err));
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

    if (isSpeechRecognitionSupported()) {
      transcriptPromiseRef.current = new Promise<string | null>((resolve) => {
        const transcriber = createLiveTranscriber({
          onInterim,
          onFinal: (text) => resolve(text.trim() ? text : null),
          onError: () => resolve(null),
        });
        transcriberRef.current = transcriber;
        transcriber?.start();
      });
    } else {
      transcriptPromiseRef.current = Promise.resolve(null);
    }

    startTimeRef.current = Date.now();
    mediaRecorder.start();
    setElapsedSeconds(0);
    setRecording(true);

    intervalRef.current = setInterval(() => {
      const seconds = Math.floor((Date.now() - startTimeRef.current) / 1000);
      setElapsedSeconds(seconds);
      if (seconds >= maxSecondsRef.current) {
        stopRecording();
      }
    }, 1000);
  }, [onError, onInterim, stopRecording, stopTracks]);

  const handleToggle = useCallback(() => {
    if (disabled) return;
    if (recording) {
      stopRecording();
    } else {
      void startRecording();
    }
  }, [disabled, recording, startRecording, stopRecording]);

  useEffect(() => {
    return () => {
      clearTimer();
      transcriberRef.current?.stop();
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
      stopTracks();
    };
  }, [clearTimer, stopTracks]);

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
