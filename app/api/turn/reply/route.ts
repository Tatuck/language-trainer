import { NextResponse } from "next/server";
import { createClient, resolveModels } from "@/lib/openrouter";
import { tutorSystem } from "@/lib/prompts";
import type { ApiError } from "@/lib/types";
import { requestTooLarge } from "@/lib/llm/body-limit";
import { capHistory, pickUserMessage } from "@/lib/llm/reply-message";
import { ReplyRequestSchema } from "@/lib/llm/requests";
import { sseEvent } from "@/lib/llm/sse";
import { isAbortError, upstreamErrorResponse } from "@/lib/llm/upstream-error";

function badRequest(error: string): NextResponse<ApiError> {
  return NextResponse.json({ error }, { status: 400 });
}

export async function POST(request: Request): Promise<Response> {
  const tooLarge = requestTooLarge(request);
  if (tooLarge) return tooLarge;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest("Request body must be valid JSON");
  }

  const parsed = ReplyRequestSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0]?.message ?? "Invalid request body");
  }
  const { audio, text, hint, topic, level } = parsed.data;
  const history = capHistory(parsed.data.history);

  let client;
  try {
    client = createClient();
  } catch (err) {
    console.error("POST /api/turn/reply: cannot create OpenRouter client", err);
    const message = err instanceof Error ? err.message : "Server misconfigured";
    return NextResponse.json<ApiError>({ error: message }, { status: 500 });
  }

  const models = resolveModels();
  const picked = pickUserMessage({
    audio,
    text,
    hint,
    historyEmpty: history.length === 0,
    sameModel: models.chat === models.audio,
  });
  if (!picked.ok) {
    return badRequest(picked.error);
  }

  let stream;
  try {
    stream = await client.chat.completions.create(
      {
        model: models.chat,
        reasoning_effort: "low",
        stream: true,
        messages: [
          { role: "system", content: tutorSystem({ topic, level }) },
          ...history.map((m): { role: "user" | "assistant"; content: string } => ({ role: m.role, content: m.content })),
          { role: "user", content: picked.content },
        ],
      },
      { signal: request.signal }
    );
  } catch (err) {
    console.error(`POST /api/turn/reply: model ${models.chat} request failed`, err);
    return upstreamErrorResponse(err);
  }

  const encoder = new TextEncoder();
  const chatModel = models.chat;
  const responseBody = new ReadableStream<Uint8Array>({
    async start(controller) {
      // Once the client disconnects the controller is closed and enqueue/close throw; after the
      // first such failure nothing else can reach the client, so later writes are skipped.
      let closed = false;
      const safeEnqueue = (event: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(event));
        } catch {
          closed = true;
        }
      };
      const safeClose = () => {
        if (closed) return;
        closed = true;
        try {
          controller.close();
        } catch {
          // Already closed by a cancel(); nothing left to release.
        }
      };
      try {
        for await (const chunk of stream) {
          const delta = chunk.choices[0]?.delta?.content;
          if (delta) safeEnqueue(sseEvent({ delta }));
        }
      } catch (err) {
        if (isAbortError(err)) {
          console.warn(`POST /api/turn/reply: stream from model ${chatModel} aborted`);
        } else {
          console.error(`POST /api/turn/reply: stream from model ${chatModel} failed mid-way`, err);
          const message = err instanceof Error ? err.message : "Stream failed";
          safeEnqueue(sseEvent({ error: message }));
        }
      } finally {
        safeEnqueue(sseEvent("[DONE]"));
        safeClose();
      }
    },
    cancel() {
      stream.controller.abort();
    },
  });

  return new Response(responseBody, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}
