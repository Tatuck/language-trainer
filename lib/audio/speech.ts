/// <reference types="dom-speech-recognition" />

/**
 * Thin wrapper around the Web Speech API (`SpeechRecognition` /
 * `webkitSpeechRecognition`) for live transcription while recording.
 */

export type LiveTranscriberOptions = {
  lang?: string;
  onInterim: (text: string) => void;
  onFinal: (text: string) => void;
  onError: (err: Error) => void;
};

export type LiveTranscriber = {
  start(): void;
  stop(): void;
};

type SpeechRecognitionCtor = new () => SpeechRecognition;

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function isSpeechRecognitionSupported(): boolean {
  return getSpeechRecognitionCtor() !== null;
}

export function createLiveTranscriber(opts: LiveTranscriberOptions): LiveTranscriber | null {
  const Ctor = getSpeechRecognitionCtor();
  if (!Ctor) return null;

  const recognition = new Ctor();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = opts.lang ?? "en-US";

  let finalText = "";
  let started = false;
  let stopRequested = false;

  recognition.onresult = (event) => {
    let interimText = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      const transcript = result[0]?.transcript ?? "";
      if (result.isFinal) {
        const trimmed = transcript.trim();
        finalText = finalText ? `${finalText} ${trimmed}` : trimmed;
      } else {
        interimText += transcript;
      }
    }
    const combined = interimText
      ? finalText
        ? `${finalText} ${interimText}`
        : interimText
      : finalText;
    opts.onInterim(combined);
  };

  recognition.onerror = (event) => {
    opts.onError(new Error(event.error));
  };

  recognition.onend = () => {
    if (started && !stopRequested) {
      recognition.start();
      return;
    }
    started = false;
    opts.onFinal(finalText);
  };

  return {
    start() {
      finalText = "";
      stopRequested = false;
      started = true;
      recognition.start();
    },
    stop() {
      stopRequested = true;
      recognition.stop();
    },
  };
}
