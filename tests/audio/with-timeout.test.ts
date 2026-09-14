import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { withTimeout } from "@/lib/audio/with-timeout";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("withTimeout", () => {
  it("resolves with the promise's value when it settles before the deadline", async () => {
    const p = withTimeout(Promise.resolve("hello"), 1500, null);
    await expect(p).resolves.toBe("hello");
  });

  it("resolves with the fallback when the promise is still pending at the deadline", async () => {
    const never = new Promise<string | null>(() => {});
    const p = withTimeout(never, 1500, null);
    vi.advanceTimersByTime(1500);
    await expect(p).resolves.toBeNull();
  });

  it("does not fire the fallback if the promise settles first", async () => {
    let resolve!: (v: string | null) => void;
    const source = new Promise<string | null>((r) => (resolve = r));
    const p = withTimeout(source, 1500, null);
    await vi.advanceTimersByTimeAsync(1000);
    resolve("late but in time");
    await vi.advanceTimersByTimeAsync(1000);
    await expect(p).resolves.toBe("late but in time");
  });

  it("propagates a rejection", async () => {
    const p = withTimeout(Promise.reject(new Error("boom")), 1500, null);
    await expect(p).rejects.toThrow("boom");
  });
});
