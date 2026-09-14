import { afterEach, describe, expect, it, vi } from "vitest";
import { newId } from "@/lib/ids";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("newId", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns a v4 UUID from crypto.randomUUID when available", () => {
    const id = newId();
    expect(id).toMatch(UUID_RE);
  });

  it("returns distinct ids on successive calls", () => {
    const ids = new Set(Array.from({ length: 50 }, () => newId()));
    expect(ids.size).toBe(50);
  });

  it("falls back to a UUID-shaped id when crypto.randomUUID is missing", () => {
    vi.stubGlobal("crypto", { getRandomValues: undefined });
    const id = newId();
    expect(id).toMatch(UUID_RE);
    expect(newId()).not.toBe(id);
  });

  it("falls back when crypto is undefined entirely", () => {
    vi.stubGlobal("crypto", undefined);
    expect(newId()).toMatch(UUID_RE);
  });
});
