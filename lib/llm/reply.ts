import type { ChatClient } from "@/lib/openrouter";
import { tutorSystem } from "@/lib/prompts";
import type { Models } from "@/lib/settings";
import type { ReplyRequest } from "@/lib/types";
import { capHistory, pickUserMessage } from "./reply-message";

/**
 * Streams the tutor's reply from the chat model, forwarding each delta to `onDelta`, and resolves
 * with the complete text. Audio goes to the chat model only when it is also the audio model;
 * otherwise the written text or the browser's transcript hint is sent instead.
 * SDK errors propagate untouched; aborting `signal` ends the stream with an AbortError.
 */
export async function streamTutorReply(
  client: ChatClient,
  models: Models,
  req: ReplyRequest,
  onDelta: (text: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  const history = capHistory(req.history);
  const picked = pickUserMessage({
    audio: req.audio,
    text: req.text,
    hint: req.hint,
    historyEmpty: history.length === 0,
    sameModel: models.chat === models.audio,
  });
  if (!picked.ok) throw new Error(picked.error);

  const stream = await client.chat.completions.create(
    {
      model: models.chat,
      reasoning_effort: "low",
      stream: true,
      messages: [
        { role: "system", content: tutorSystem({ topic: req.topic, level: req.level }) },
        ...history.map((m): { role: "user" | "assistant"; content: string } => ({ role: m.role, content: m.content })),
        { role: "user", content: picked.content },
      ],
    },
    { signal },
  );

  let text = "";
  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content;
    if (!delta) continue;
    text += delta;
    onDelta(delta);
  }
  return text;
}
