import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkApiKey, createClient, listModels } from "@/lib/openrouter";

describe("createClient", () => {
  it("throws a Settings hint when the key is blank", () => {
    expect(() => createClient("")).toThrow(/Settings/);
    expect(() => createClient("   ")).toThrow(/Settings/);
  });

  it("points at the OpenRouter base URL and allows browser use", () => {
    const client = createClient("sk-or-test");
    expect(client.baseURL).toBe("https://openrouter.ai/api/v1");
    expect(client.apiKey).toBe("sk-or-test");
  });

  it("trims the key, times out after 60 s and retries at most once", () => {
    const client = createClient("  sk-or-test\n");
    expect(client.apiKey).toBe("sk-or-test");
    expect(client.timeout).toBe(60000);
    expect(client.maxRetries).toBe(1);
  });
});

describe("checkApiKey", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("GETs /auth/key with the bearer key and maps the answer", async () => {
    fetchMock.mockResolvedValue(Response.json({ data: { label: "sk-or-v1-abc…", usage: 0.42, limit: 5 } }));
    await expect(checkApiKey(" sk-or-test ")).resolves.toEqual({ label: "sk-or-v1-abc…", usage: 0.42, limit: 5 });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://openrouter.ai/api/v1/auth/key");
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer sk-or-test");
  });

  it("tolerates missing or odd fields", async () => {
    fetchMock.mockResolvedValue(Response.json({ data: { usage: "lots" } }));
    await expect(checkApiKey("sk-or-test")).resolves.toEqual({ label: null, usage: null, limit: null });
    fetchMock.mockResolvedValue(Response.json({}));
    await expect(checkApiKey("sk-or-test")).resolves.toEqual({ label: null, usage: null, limit: null });
  });

  it("rejects a blank key without calling the network", async () => {
    await expect(checkApiKey("")).rejects.toThrow(/Settings/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects with a fixed message on 401/403 and with the status otherwise", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 401 }));
    await expect(checkApiKey("sk-or-test")).rejects.toThrow(/rejected/);
    fetchMock.mockResolvedValue(new Response("{}", { status: 503, statusText: "Service Unavailable" }));
    await expect(checkApiKey("sk-or-test")).rejects.toThrow(/503 Service Unavailable/);
  });

  it("forwards the abort signal", async () => {
    fetchMock.mockResolvedValue(Response.json({ data: {} }));
    const ac = new AbortController();
    await checkApiKey("sk-or-test", ac.signal);
    expect(fetchMock.mock.calls[0][1]?.signal).toBe(ac.signal);
  });
});

describe("listModels", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  const catalogue = {
    data: [
      { id: "openai/gpt-5.5-mini", architecture: { input_modalities: ["text", "image"] } },
      { id: "google/gemini-3.8-flash", architecture: { input_modalities: ["text", "image", "audio"] } },
      { id: "meta/muse-spark-1.3", architecture: { input_modalities: ["audio", "text"] } },
    ],
  };

  it("GETs /models with the bearer key and maps ids sorted, flagging audio input", async () => {
    fetchMock.mockResolvedValue(Response.json(catalogue));
    await expect(listModels(" sk-or-test ")).resolves.toEqual([
      { id: "google/gemini-3.8-flash", audio: true },
      { id: "meta/muse-spark-1.3", audio: true },
      { id: "openai/gpt-5.5-mini", audio: false },
    ]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://openrouter.ai/api/v1/models");
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer sk-or-test");
  });

  it("sends no Authorization header without a key (the endpoint is public)", async () => {
    fetchMock.mockResolvedValue(Response.json(catalogue));
    await listModels("");
    expect(new Headers(fetchMock.mock.calls[0][1]?.headers).has("authorization")).toBe(false);
  });

  it("skips junk entries and tolerates odd shapes", async () => {
    fetchMock.mockResolvedValue(
      Response.json({ data: [{ id: "a/b" }, { id: 7 }, null, "x", { id: "", architecture: {} }, { id: "c/d", architecture: { input_modalities: "audio" } }] }),
    );
    await expect(listModels("sk-or-test")).resolves.toEqual([
      { id: "a/b", audio: false },
      { id: "c/d", audio: false },
    ]);
    fetchMock.mockResolvedValue(Response.json({}));
    await expect(listModels("sk-or-test")).resolves.toEqual([]);
  });

  it("rejects with the status when OpenRouter does not answer 2xx", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 503, statusText: "Service Unavailable" }));
    await expect(listModels("sk-or-test")).rejects.toThrow(/503 Service Unavailable/);
  });

  it("forwards the abort signal", async () => {
    fetchMock.mockResolvedValue(Response.json(catalogue));
    const ac = new AbortController();
    await listModels("sk-or-test", ac.signal);
    expect(fetchMock.mock.calls[0][1]?.signal).toBe(ac.signal);
  });
});
