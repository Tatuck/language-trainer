import { NextResponse } from "next/server";
import { APIError } from "openai";
import { createClient, resolveModels } from "@/lib/openrouter";
import { tutorSystem } from "@/lib/prompts";
import type { ApiError } from "@/lib/types";
import { requestTooLarge } from "@/lib/llm/body-limit";
import { capHistory, pickUserMessage } from "@/lib/llm/reply-message";
import { ReplyRequestSchema } from "@/lib/llm/requests";
import { sseEvent } from "@/lib/llm/sse";

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
    stream = await client.chat.completions.create({
      model: models.chat,
      reasoning_effort: "low",
      stream: true,
      messages: [
        { role: "system", content: tutorSystem({ topic, level }) },
        ...history.map((m): { role: "user" | "assistant"; content: string } => ({ role: m.role, content: m.content })),
        { role: "user", content: picked.content },
      ],
    });
  } catch (err) {
    console.error(`POST /api/turn/reply: model ${models.chat} request failed`, err);
    if (err instanceof APIError) {
      return NextResponse.json<ApiError>({ error: err.message }, { status: err.status ?? 502 });
    }
    return NextResponse.json<ApiError>({ error: "Unexpected error calling the model" }, { status: 502 });
  }

  const encoder = new TextEncoder();
  const chatModel = models.chat;
  const responseBody = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const chunk of stream) {
          const delta = chunk.choices[0]?.delta?.content;
          if (delta) controller.enqueue(encoder.encode(sseEvent({ delta })));
        }
      } catch (err) {
        console.error(`POST /api/turn/reply: stream from model ${chatModel} failed mid-way`, err);
        const message = err instanceof Error ? err.message : "Stream failed";
        controller.enqueue(encoder.encode(sseEvent({ error: message })));
      } finally {
        controller.enqueue(encoder.encode(sseEvent("[DONE]")));
        controller.close();
      }
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
