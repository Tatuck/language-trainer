/** Encodes one Server-Sent Events data line, per the format documented on `ReplyRequest` in `lib/types.ts`. */
export function sseEvent(payload: object | "[DONE]"): string {
  const data = payload === "[DONE]" ? "[DONE]" : JSON.stringify(payload);
  return `data: ${data}\n\n`;
}
