import type { ChatClient } from "@/lib/openrouter";
import { analyzerSystem } from "@/lib/prompts";
import { AnalysisSchema, analysisJsonSchema, type Analysis } from "@/lib/schema";
import type { AnalyzeRequest } from "@/lib/types";
import { buildAnalyzeUserContent } from "./analyze-message";

export const INVALID_ANALYSIS_MESSAGE = "Model returned an invalid analysis";

type Attempt = { ok: true; data: Analysis } | { ok: false };

/**
 * One learner turn → strict-JSON `Analysis` from the audio model. Tries at low reasoning effort,
 * once more at medium when the first answer is not a valid analysis, then gives up.
 * SDK errors (auth, rate limit, network, abort) propagate untouched.
 */
export async function analyzeTurn(
  client: ChatClient,
  model: string,
  req: AnalyzeRequest,
  signal?: AbortSignal,
): Promise<Analysis> {
  const system = analyzerSystem({ level: req.level, lang: req.lang });
  const userContent = buildAnalyzeUserContent({ audio: req.audio, text: req.text, hint: req.hint });

  const attempt = async (reasoningEffort: "low" | "medium"): Promise<Attempt> => {
    const completion = await client.chat.completions.create(
      {
        model,
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
      { signal },
    );
    const raw = completion.choices[0]?.message?.content ?? "";
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      return { ok: false };
    }
    const result = AnalysisSchema.safeParse(json);
    return result.success ? { ok: true, data: result.data } : { ok: false };
  };

  let outcome = await attempt("low");
  if (!outcome.ok) outcome = await attempt("medium");
  if (!outcome.ok) throw new Error(INVALID_ANALYSIS_MESSAGE);
  return outcome.data;
}
