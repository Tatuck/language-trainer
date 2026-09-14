import { afterEach, describe, expect, it, vi } from "vitest";
import { createLiveTranscriber, isSpeechRecognitionSupported } from "@/lib/audio/speech";

type FakeAlternative = { transcript: string };
type FakeResult = { 0: FakeAlternative; isFinal: boolean; length: number };
type FakeEvent = { resultIndex: number; results: FakeResult[] & { length: number } };

function fakeResult(transcript: string, isFinal: boolean): FakeResult {
  return { 0: { transcript }, isFinal, length: 1 };
}

function fakeEvent(resultIndex: number, results: FakeResult[]): FakeEvent {
  return { resultIndex, results };
}

class FakeSpeechRecognition {
  static instances: FakeSpeechRecognition[] = [];
  continuous = false;
  interimResults = false;
  lang = "";
  onresult: ((event: FakeEvent) => void) | null = null;
  onerror: ((event: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  start = vi.fn();
  stop = vi.fn();

  constructor() {
    FakeSpeechRecognition.instances.push(this);
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
  FakeSpeechRecognition.instances = [];
});

describe("isSpeechRecognitionSupported", () => {
  it("is false when window is undefined", () => {
    vi.stubGlobal("window", undefined);
    expect(isSpeechRecognitionSupported()).toBe(false);
  });

  it("is false when neither SpeechRecognition nor webkitSpeechRecognition exist", () => {
    vi.stubGlobal("window", {});
    expect(isSpeechRecognitionSupported()).toBe(false);
  });

  it("is true when window.SpeechRecognition exists", () => {
    vi.stubGlobal("window", { SpeechRecognition: FakeSpeechRecognition });
    expect(isSpeechRecognitionSupported()).toBe(true);
  });

  it("is true when window.webkitSpeechRecognition exists", () => {
    vi.stubGlobal("window", { webkitSpeechRecognition: FakeSpeechRecognition });
    expect(isSpeechRecognitionSupported()).toBe(true);
  });
});

describe("createLiveTranscriber", () => {
  it("returns null when speech recognition is unsupported", () => {
    vi.stubGlobal("window", {});
    const transcriber = createLiveTranscriber({
      onInterim: vi.fn(),
      onFinal: vi.fn(),
      onError: vi.fn(),
    });
    expect(transcriber).toBeNull();
  });

  it("configures continuous + interim results and defaults lang to en-US", () => {
    vi.stubGlobal("window", { SpeechRecognition: FakeSpeechRecognition });
    createLiveTranscriber({ onInterim: vi.fn(), onFinal: vi.fn(), onError: vi.fn() });
    const instance = FakeSpeechRecognition.instances[0];
    expect(instance.continuous).toBe(true);
    expect(instance.interimResults).toBe(true);
    expect(instance.lang).toBe("en-US");
  });

  it("honours an explicit lang option", () => {
    vi.stubGlobal("window", { SpeechRecognition: FakeSpeechRecognition });
    createLiveTranscriber({ lang: "es-ES", onInterim: vi.fn(), onFinal: vi.fn(), onError: vi.fn() });
    expect(FakeSpeechRecognition.instances[0].lang).toBe("es-ES");
  });

  it("calls start() on the underlying recognition when start() is invoked", () => {
    vi.stubGlobal("window", { SpeechRecognition: FakeSpeechRecognition });
    const transcriber = createLiveTranscriber({ onInterim: vi.fn(), onFinal: vi.fn(), onError: vi.fn() });
    transcriber?.start();
    expect(FakeSpeechRecognition.instances[0].start).toHaveBeenCalledTimes(1);
  });

  it("reports interim text before any final result", () => {
    vi.stubGlobal("window", { SpeechRecognition: FakeSpeechRecognition });
    const onInterim = vi.fn();
    const transcriber = createLiveTranscriber({ onInterim, onFinal: vi.fn(), onError: vi.fn() });
    transcriber?.start();
    const instance = FakeSpeechRecognition.instances[0];

    instance.onresult?.(fakeEvent(0, [fakeResult("hello", false)]));

    expect(onInterim).toHaveBeenCalledWith("hello");
  });

  it("accumulates final results and appends the current interim after them", () => {
    vi.stubGlobal("window", { SpeechRecognition: FakeSpeechRecognition });
    const onInterim = vi.fn();
    const transcriber = createLiveTranscriber({ onInterim, onFinal: vi.fn(), onError: vi.fn() });
    transcriber?.start();
    const instance = FakeSpeechRecognition.instances[0];

    const firstFinal = fakeResult("hello world", true);
    instance.onresult?.(fakeEvent(0, [firstFinal]));
    // event.results accumulates across events; resultIndex marks the first new entry.
    instance.onresult?.(fakeEvent(1, [firstFinal, fakeResult("how are", false)]));

    expect(onInterim).toHaveBeenNthCalledWith(1, "hello world");
    expect(onInterim).toHaveBeenNthCalledWith(2, "hello world how are");
  });

  it("calls onFinal with the accumulated text once stop() completes", () => {
    vi.stubGlobal("window", { SpeechRecognition: FakeSpeechRecognition });
    const onFinal = vi.fn();
    const transcriber = createLiveTranscriber({ onInterim: vi.fn(), onFinal, onError: vi.fn() });
    transcriber?.start();
    const instance = FakeSpeechRecognition.instances[0];

    instance.onresult?.(fakeEvent(0, [fakeResult("hello world", true)]));
    transcriber?.stop();
    instance.onend?.();

    expect(instance.stop).toHaveBeenCalledTimes(1);
    expect(onFinal).toHaveBeenCalledWith("hello world");
  });

  it("restarts recognition on an unrequested onend (Chrome silence timeout)", () => {
    vi.stubGlobal("window", { SpeechRecognition: FakeSpeechRecognition });
    const onFinal = vi.fn();
    const transcriber = createLiveTranscriber({ onInterim: vi.fn(), onFinal, onError: vi.fn() });
    transcriber?.start();
    const instance = FakeSpeechRecognition.instances[0];

    instance.onend?.();

    expect(instance.start).toHaveBeenCalledTimes(2); // once from transcriber.start(), once from the restart
    expect(onFinal).not.toHaveBeenCalled();
  });

  it("wraps recognition errors and forwards them via onError", () => {
    vi.stubGlobal("window", { SpeechRecognition: FakeSpeechRecognition });
    const onError = vi.fn();
    const transcriber = createLiveTranscriber({ onInterim: vi.fn(), onFinal: vi.fn(), onError });
    transcriber?.start();
    const instance = FakeSpeechRecognition.instances[0];

    instance.onerror?.({ error: "no-speech" });

    expect(onError).toHaveBeenCalledWith(expect.any(Error));
    expect((onError.mock.calls[0][0] as Error).message).toBe("no-speech");
  });
});
