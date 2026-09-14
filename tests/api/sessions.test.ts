import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getSession, putSession } from "@/lib/db";
import { INTERRUPTED_ANALYSIS } from "@/lib/session-normalise";
import type { Session } from "@/lib/types";

const { GET: LIST } = await import("@/app/api/sessions/route");
const { GET, PUT, DELETE } = await import("@/app/api/sessions/[id]/route");

const base: Session = {
  id: "s1",
  topic: "Travel",
  level: "B1",
  lang: "es",
  createdAt: "2026-09-14T08:00:00.000Z",
  turns: [],
};

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

function put(id: string, body: unknown, init: { raw?: string; headers?: Record<string, string> } = {}) {
  return new Request(`http://x/api/sessions/${id}`, {
    method: "PUT",
    headers: { "content-type": "application/json", ...init.headers },
    body: init.raw ?? JSON.stringify(body),
  });
}

describe("/api/sessions", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "lt-api-"));
    process.env.LT_DB_PATH = path.join(dir, "lt.sqlite");
  });

  afterEach(() => {
    closeDb();
    delete process.env.LT_DB_PATH;
    rmSync(dir, { recursive: true, force: true });
  });

  describe("GET /api/sessions", () => {
    it("returns an empty list on a fresh database", async () => {
      const res = await LIST();
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual([]);
    });

    it("returns summaries newest first", async () => {
      putSession({ ...base, id: "a", createdAt: "2026-01-01T00:00:00.000Z" });
      putSession({
        ...base,
        id: "b",
        createdAt: "2026-02-01T00:00:00.000Z",
        turns: [{ role: "user", id: "u1", hint: "hi", analysis: null, error: "x" }],
      });
      const res = await LIST();
      const json = await res.json();
      expect(json.map((s: { id: string }) => s.id)).toEqual(["b", "a"]);
      expect(json[0]).toMatchObject({ topic: "Travel", level: "B1", lang: "es", turnCount: 1 });
      expect(json[0].turns).toBeUndefined();
    });
  });

  describe("PUT /api/sessions/[id]", () => {
    it("stores a valid session and answers 204 with no body", async () => {
      const res = await PUT(put("s1", base), ctx("s1"));
      expect(res.status).toBe(204);
      expect(await res.text()).toBe("");
      expect(getSession("s1")).toEqual(base);
    });

    it("upserts and settles in-flight turns", async () => {
      await PUT(put("s1", base), ctx("s1"));
      const res = await PUT(
        put(
          "s1",
          {
            ...base,
            topic: "Renamed",
            turns: [
              { role: "user", id: "u1", hint: "hi", analysis: null, error: null },
              { role: "bot", id: "b1", text: "", streaming: true, error: null },
            ],
          },
          {},
        ),
        ctx("s1"),
      );
      expect(res.status).toBe(204);
      const stored = getSession("s1")!;
      expect(stored.topic).toBe("Renamed");
      expect(stored.turns).toEqual([{ role: "user", id: "u1", hint: "hi", analysis: null, error: INTERRUPTED_ANALYSIS }]);
    });

    it("400s when the body id does not match the URL", async () => {
      const res = await PUT(put("other", base), ctx("other"));
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toMatch(/id/i);
      expect(getSession("s1")).toBeNull();
      expect(getSession("other")).toBeNull();
    });

    it("400s on malformed JSON", async () => {
      const res = await PUT(put("s1", undefined, { raw: "{nope" }), ctx("s1"));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toMatch(/json/i);
    });

    it("400s on validation failures with a message", async () => {
      const cases: unknown[] = [
        { ...base, topic: "" },
        { ...base, topic: "t".repeat(201) },
        { ...base, level: "Z1" },
        { ...base, lang: "fr" },
        { ...base, createdAt: "not a date" },
        { ...base, turns: "nope" },
        { ...base, turns: [{ role: "bot", id: "b1", text: "x", streaming: false }] },
        { ...base, turns: Array.from({ length: 501 }, () => ({ role: "bot", id: "b", text: "x", streaming: false, error: null })) },
        "a string",
      ];
      for (const body of cases) {
        const res = await PUT(put("s1", body), ctx("s1"));
        expect(res.status, JSON.stringify(body).slice(0, 60)).toBe(400);
        const json = await res.json();
        expect(typeof json.error).toBe("string");
        expect(json.error.length).toBeGreaterThan(0);
      }
      expect(getSession("s1")).toBeNull();
    });

    it("413s before reading the body when Content-Length exceeds the limit", async () => {
      const res = await PUT(put("s1", base, { headers: { "content-length": "6000001" } }), ctx("s1"));
      expect(res.status).toBe(413);
      expect((await res.json()).error).toBe("Request too large");
    });
  });

  describe("GET /api/sessions/[id]", () => {
    it("returns the full session", async () => {
      const session: Session = {
        ...base,
        turns: [{ role: "bot", id: "b1", text: "Hi.", streaming: false, error: null }],
      };
      putSession(session);
      const res = await GET(new Request("http://x/api/sessions/s1"), ctx("s1"));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual(session);
    });

    it("404s with an error body for an unknown id", async () => {
      const res = await GET(new Request("http://x/api/sessions/nope"), ctx("nope"));
      expect(res.status).toBe(404);
      expect((await res.json()).error).toMatch(/not found/i);
    });
  });

  describe("DELETE /api/sessions/[id]", () => {
    it("removes the session and answers 204, then 404 on repeat", async () => {
      putSession(base);
      const first = await DELETE(new Request("http://x/api/sessions/s1", { method: "DELETE" }), ctx("s1"));
      expect(first.status).toBe(204);
      expect(getSession("s1")).toBeNull();
      const second = await DELETE(new Request("http://x/api/sessions/s1", { method: "DELETE" }), ctx("s1"));
      expect(second.status).toBe(404);
      expect((await second.json()).error).toMatch(/not found/i);
    });
  });
});
