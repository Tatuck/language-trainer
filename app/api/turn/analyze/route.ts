import { NextResponse } from "next/server";
import { APIError } from "openai";
import { createClient, resolveModels } from "@/lib/openrouter";
import { analyzerSystem } from "@/lib/prompts";
import { AnalysisSchema, analysisJsonSchema, type Analysis } from "@/lib/schema";
import type { ApiError } from "@/lib/types";
import { buildAnalyzeUserContent } from "@/lib/llm/analyze-message";
import { requestTooLarge } from "@/lib/llm/body-limit";
import { AnalyzeRequestSchema } from "@/lib/llm/requests";

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

  const parsed = AnalyzeRequestSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0]?.message ?? "Invalid request body");
  }
  const { audio, text, hint, level, lang } = parsed.data;

  let client;
  try {
    client = createClient();
  } catch (err) {
    console.error("POST /api/turn/analyze: cannot create OpenRouter client", err);
    const message = err instanceof Error ? err.message : "Server misconfigured";
    return NextResponse.json<ApiError>({ error: message }, { status: 500 });
  }

  const { audio: audioModel } = resolveModels();
  const system = analyzerSystem({ level, lang });
  const userContent = buildAnalyzeUserContent({ audio, text, hint });

  const attempt = async (reasoningEffort: "low" | "medium") => {
    const completion = await client.chat.completions.create({
      model: audioModel,
      reasoning_effort: reasoningEffort,
      messages: [
        { role: "system", content: system },
        { role: "user", content: userContent },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "analysis", strict: true, schema: analysisJsonSchema },
      },
    });
    const raw = completion.choices[0]?.message?.content ?? "";
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      return { ok: false as const };
    }
    const result = AnalysisSchema.safeParse(json);
    return result.success ? { ok: true as const, data: result.data } : { ok: false as const };
  };

  let outcome: { ok: true; data: Analysis } | { ok: false };
  try {
    outcome = await attempt("low");
    if (!outcome.ok) {
      outcome = await attempt("medium");
    }
  } catch (err) {
    console.error(`POST /api/turn/analyze: model ${audioModel} request failed`, err);
    const message = err instanceof APIError ? err.message : "Unexpected error calling the model";
    return NextResponse.json<ApiError>({ error: message }, { status: 502 });
  }

  if (!outcome.ok) {
    console.error(`POST /api/turn/analyze: model ${audioModel} returned an invalid analysis twice`);
    return NextResponse.json<ApiError>({ error: "Model returned an invalid analysis" }, { status: 502 });
  }

  return NextResponse.json<Analysis>(outcome.data, { status: 200 });
}
