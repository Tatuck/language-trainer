/**
 * Random id for sessions and turns. Uses `crypto.randomUUID()` where available
 * (all modern browsers on secure contexts, Node 19+) and otherwise builds a
 * v4-shaped UUID from `Math.random`, which is good enough for local-only ids.
 */
export function newId(): string {
  const c = (globalThis as { crypto?: Partial<Crypto> }).crypto;
  if (c && typeof c.randomUUID === "function") {
    return c.randomUUID();
  }
  const hex = (n: number) => n.toString(16).padStart(2, "0");
  const bytes = new Uint8Array(16);
  if (c && typeof c.getRandomValues === "function") {
    c.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const h = Array.from(bytes, hex).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
