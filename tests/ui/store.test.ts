import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  STORAGE_KEY,
  createSession,
  deleteSession,
  loadSession,
  loadSessions,
  migrateLocalStorage,
  saveSession,
} from "@/lib/store";
import type { Session } from "@/lib/types";

function fakeStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    map,
    getItem: vi.fn((k: string) => map.get(k) ?? null),
    setItem: vi.fn((k: string, v: string) => {
      map.set(k, v);
    }),
    removeItem: vi.fn((k: string) => {
      map.delete(k);
    }),
  };
}

const STATUS_TEXT: Record<number, string> = {
  200: "OK",
  204: "No Content",
  400: "Bad Request",
  404: "Not Found",
  500: "Internal Server Error",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(body === null ? null : JSON.stringify(body), {
    status,
    statusText: STATUS_TEXT[status],
    headers: body === null ? {} : { "content-type": "application/json" },
  });
}

const base: Session = {
  id: "s1",
  topic: "Travel",
  level: "B1",
  lang: "es",
  createdAt: "2026-09-14T08:00:00.000Z",
  turns: [],
};

const summary = {
  id: "s1",
  topic: "Travel",
  level: "B1",
  lang: "es",
  createdAt: base.createdAt,
  updatedAt: base.createdAt,
  turnCount: 0,
};

describe("store (API client)", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("localStorage", undefined);
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function calls() {
    return fetchMock.mock.calls.map(([url, init]) => {
      const options = init as RequestInit | undefined;
      return { url: String(url), method: options?.method ?? "GET", init: options };
    });
  }

  it("keeps the legacy localStorage key name for the migration", () => {
    expect(STORAGE_KEY).toBe("lt:sessions:v1");
  });

  it("loadSessions GETs the summaries", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse([summary]));
    await expect(loadSessions()).resolves.toEqual([summary]);
    expect(calls().map((c) => `${c.method} ${c.url}`)).toEqual(["GET /api/sessions"]);
  });

  it("loadSession GETs the session by id and maps 404 to null", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(base));
    await expect(loadSession("s1")).resolves.toEqual(base);
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "Session not found" }, 404));
    await expect(loadSession("a/b c")).resolves.toBeNull();
    expect(calls().map((c) => c.url)).toEqual(["/api/sessions/s1", "/api/sessions/a%2Fb%20c"]);
  });

  it("saveSession PUTs the JSON body to the session URL", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(null, 204));
    await expect(saveSession(base)).resolves.toBeUndefined();
    const [call] = calls();
    expect(call.url).toBe("/api/sessions/s1");
    expect(call.method).toBe("PUT");
    expect(new Headers(call.init?.headers).get("content-type")).toBe("application/json");
    expect(JSON.parse(String(call.init?.body))).toEqual(base);
  });

  it("deleteSession DELETEs and resolves on 204", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(null, 204));
    await expect(deleteSession("s1")).resolves.toBeUndefined();
    expect(calls().map((c) => `${c.method} ${c.url}`)).toEqual(["DELETE /api/sessions/s1"]);
  });

  it("throws the server's error message on a non-2xx response", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "topic: Too big" }, 400));
    await expect(saveSession(base)).rejects.toThrow("topic: Too big");
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "Session not found" }, 404));
    await expect(deleteSession("s1")).rejects.toThrow("Session not found");
  });

  it("falls back to the status text when the error body is not JSON or has no error", async () => {
    fetchMock.mockResolvedValueOnce(new Response("<html>boom</html>", { status: 500, statusText: "Internal Server Error" }));
    await expect(loadSessions()).rejects.toThrow("Internal Server Error");
    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 502, statusText: "Bad Gateway" }));
    await expect(loadSession("s1")).rejects.toThrow("Bad Gateway");
  });

  it("createSession is pure: a fresh id, createdAt and no turns, and no request", () => {
    const s = createSession({ topic: "Food", level: "A2", lang: "en" });
    expect(s.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(s).toMatchObject({ topic: "Food", level: "A2", lang: "en", turns: [] });
    expect(Number.isNaN(Date.parse(s.createdAt))).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  describe("migrateLocalStorage", () => {
    it("returns 0 without touching the network when localStorage is unavailable or empty", async () => {
      await expect(migrateLocalStorage()).resolves.toBe(0);
      const storage = fakeStorage();
      vi.stubGlobal("localStorage", storage);
      await expect(migrateLocalStorage()).resolves.toBe(0);
      expect(fetchMock).not.toHaveBeenCalled();
      expect(storage.removeItem).not.toHaveBeenCalled();
      expect(warn).not.toHaveBeenCalled();
    });

    it("PUTs every stored session in order, removes the key and returns the count", async () => {
      const older = { ...base, id: "a", createdAt: "2026-01-01T00:00:00.000Z" };
      const newer = { ...base, id: "b", createdAt: "2026-02-01T00:00:00.000Z" };
      const storage = fakeStorage({ [STORAGE_KEY]: JSON.stringify([newer, older]) });
      vi.stubGlobal("localStorage", storage);
      fetchMock.mockResolvedValue(jsonResponse(null, 204));
      await expect(migrateLocalStorage()).resolves.toBe(2);
      expect(calls().map((c) => `${c.method} ${c.url}`)).toEqual(["PUT /api/sessions/b", "PUT /api/sessions/a"]);
      expect(storage.removeItem).toHaveBeenCalledWith(STORAGE_KEY);
      expect(storage.map.has(STORAGE_KEY)).toBe(false);
      expect(warn).not.toHaveBeenCalled();
    });

    it("normalises legacy entries and skips ones that are not session-shaped, with one warning", async () => {
      const legacy = { ...base, turns: [{ role: "bot", id: "b1", text: "Hi.", streaming: false }] };
      const storage = fakeStorage({ [STORAGE_KEY]: JSON.stringify([legacy, null, 42, { id: 7 }]) });
      vi.stubGlobal("localStorage", storage);
      fetchMock.mockResolvedValue(jsonResponse(null, 204));
      await expect(migrateLocalStorage()).resolves.toBe(1);
      const [call] = calls();
      expect(JSON.parse(String(call.init?.body)).turns[0]).toEqual({
        role: "bot",
        id: "b1",
        text: "Hi.",
        streaming: false,
        error: null,
      });
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0][0])).toMatch(/3/);
      expect(storage.map.has(STORAGE_KEY)).toBe(false);
    });

    it("keeps the key and rethrows when a PUT fails, so the next load retries", async () => {
      const storage = fakeStorage({ [STORAGE_KEY]: JSON.stringify([{ ...base, id: "a" }, { ...base, id: "b" }]) });
      vi.stubGlobal("localStorage", storage);
      fetchMock.mockResolvedValueOnce(jsonResponse(null, 204));
      fetchMock.mockResolvedValueOnce(jsonResponse({ error: "disk full" }, 500));
      await expect(migrateLocalStorage()).rejects.toThrow("disk full");
      expect(storage.removeItem).not.toHaveBeenCalled();
      expect(storage.map.has(STORAGE_KEY)).toBe(true);
    });

    it("warns and returns 0, keeping the key, when the stored value is not a JSON array", async () => {
      const storage = fakeStorage({ [STORAGE_KEY]: "{not json" });
      vi.stubGlobal("localStorage", storage);
      await expect(migrateLocalStorage()).resolves.toBe(0);
      storage.map.set(STORAGE_KEY, JSON.stringify({ not: "an array" }));
      await expect(migrateLocalStorage()).resolves.toBe(0);
      expect(warn).toHaveBeenCalledTimes(2);
      expect(fetchMock).not.toHaveBeenCalled();
      expect(storage.map.has(STORAGE_KEY)).toBe(true);
    });

    it("warns and returns 0 when reading storage throws (private mode)", async () => {
      const storage = fakeStorage();
      storage.getItem.mockImplementation(() => {
        throw new Error("SecurityError");
      });
      vi.stubGlobal("localStorage", storage);
      await expect(migrateLocalStorage()).resolves.toBe(0);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("still reports the imported count when removing the key throws", async () => {
      const storage = fakeStorage({ [STORAGE_KEY]: JSON.stringify([base]) });
      storage.removeItem.mockImplementation(() => {
        throw new Error("SecurityError");
      });
      vi.stubGlobal("localStorage", storage);
      fetchMock.mockResolvedValue(jsonResponse(null, 204));
      await expect(migrateLocalStorage()).resolves.toBe(1);
      expect(warn).toHaveBeenCalledTimes(1);
    });
  });
});
