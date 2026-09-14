import { NextResponse } from "next/server";
import { resolveModels } from "@/lib/openrouter";
import { analyzerSystem } from "@/lib/prompts";
import { AnalysisSchema, analysisJsonSchema, type Analysis } from "@/lib/schema";
import type { ApiError } from "@/lib/types";
import { buildAnalyzeUserContent } from "@/lib/llm/analyze-message";
import { requestTooLarge } from "@/lib/llm/body-limit";
import { createClientOrError } from "@/lib/llm/client";
import { AnalyzeRequestSchema } from "@/lib/llm/requests";
import { upstreamErrorResponse } from "@/lib/llm/upstream-error";
import { parseJsonBody, validationError } from "../../responses";

export async function POST(request: Request): Promise<Response> {
  const tooLarge = requestTooLarge(request);
  if (tooLarge) return tooLarge;

  const parsedBody = await parseJsonBody(request);
  if (!parsedBody.ok) return parsedBody.response;

  const parsed = AnalyzeRequestSchema.safeParse(parsedBody.body);
  if (!parsed.success) return validationError(parsed.error);
  const { audio, text, hint, level, lang } = parsed.data;

  const clientResult = createClientOrError("POST /api/turn/analyze");
  if (!clientResult.ok) return clientResult.response;
  const client = clientResult.client;

  const { audio: audioModel } = resolveModels();
  const system = analyzerSystem({ level, lang });
  const userContent = buildAnalyzeUserContent({ audio, text, hint });

  const attempt = async (reasoningEffort: "low" | "medium") => {
    const completion = await client.chat.completions.create(
      {
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
      },
      { signal: request.signal }
    );
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
    return upstreamErrorResponse(err);
  }

  if (!outcome.ok) {
    console.error(`POST /api/turn/analyze: model ${audioModel} returned an invalid analysis twice`);
    return NextResponse.json<ApiError>({ error: "Model returned an invalid analysis" }, { status: 502 });
  }

  return NextResponse.json<Analysis>(outcome.data, { status: 200 });
}
