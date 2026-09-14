import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveModels, createClient } from "@/lib/openrouter";

afterEach(() => vi.unstubAllEnvs());

describe("resolveModels", () => {
  it("defaults chat and audio to OPENROUTER_MODEL", () => {
    vi.stubEnv("OPENROUTER_MODEL", "meta/muse-spark-1.3");
    vi.stubEnv("OPENROUTER_AUDIO_MODEL", "");
    expect(resolveModels()).toEqual({ chat: "meta/muse-spark-1.3", audio: "meta/muse-spark-1.3" });
  });

  it("uses OPENROUTER_AUDIO_MODEL for audio when set", () => {
    vi.stubEnv("OPENROUTER_MODEL", "meta/muse-spark-1.3");
    vi.stubEnv("OPENROUTER_AUDIO_MODEL", "google/gemini-3.8-flash");
    expect(resolveModels().audio).toBe("google/gemini-3.8-flash");
  });

  it("falls back to meta/muse-spark-1.3 when nothing is set", () => {
    vi.stubEnv("OPENROUTER_MODEL", "");
    vi.stubEnv("OPENROUTER_AUDIO_MODEL", "");
    expect(resolveModels().chat).toBe("meta/muse-spark-1.3");
  });
});

describe("createClient", () => {
  it("throws a clear error when OPENROUTER_API_KEY is missing", () => {
    vi.stubEnv("OPENROUTER_API_KEY", "");
    expect(() => createClient()).toThrow(/OPENROUTER_API_KEY/);
  });

  it("points at the OpenRouter base URL", () => {
    vi.stubEnv("OPENROUTER_API_KEY", "sk-or-test");
    expect(createClient().baseURL).toBe("https://openrouter.ai/api/v1");
  });

  it("times out after 60 s and retries at most once", () => {
    vi.stubEnv("OPENROUTER_API_KEY", "sk-or-test");
    const client = createClient();
    expect(client.timeout).toBe(60000);
    expect(client.maxRetries).toBe(1);
  });
});
