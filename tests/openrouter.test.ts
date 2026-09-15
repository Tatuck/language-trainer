import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkApiKey, createClient } from "@/lib/openrouter";

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
