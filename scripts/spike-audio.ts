/**
 * Task 0 spike: does the chosen OpenRouter model transcribe + analyse + judge pronunciation from audio?
 * Usage: npm run spike [-- model1 model2 ...]   (defaults below)
 * Needs OPENROUTER_API_KEY in .env.local. Prints JSON, usage and latency per model × fixture.
 */
import { readFileSync } from "node:fs";
import { createClient } from "../lib/openrouter";
import { analyzerSystem } from "../lib/prompts";
import { AnalysisSchema, analysisJsonSchema } from "../lib/schema";

const models = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ["meta/muse-spark-1.3", "google/gemini-3.8-flash"];
const fixtures = ["fixtures/sample-es.wav", "fixtures/sample-en.wav"];
const client = createClient();

for (const model of models) {
  for (const file of fixtures) {
    const wavBase64 = readFileSync(file).toString("base64");
    const t0 = Date.now();
    try {
      const res = await client.chat.completions.create({
        model,
        reasoning_effort: "low",
        messages: [
          { role: "system", content: analyzerSystem({ level: "B1", lang: "es" }) },
          {
            role: "user",
            content: [
              { type: "input_audio", input_audio: { data: wavBase64, format: "wav" } },
              { type: "text", text: "Analyse what I just said." },
            ],
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: { name: "analysis", strict: true, schema: analysisJsonSchema },
        },
      });
      const ms = Date.now() - t0;
      const raw = res.choices[0]?.message?.content ?? "";
      console.log(`\n=== ${model} × ${file}  (${ms} ms)`);
      console.log("usage:", JSON.stringify(res.usage));
      const parsed = AnalysisSchema.safeParse(JSON.parse(raw));
      if (!parsed.success) {
        console.log("SCHEMA FAIL:", parsed.error.issues.slice(0, 3));
        console.log(raw.slice(0, 800));
        continue;
      }
      const a = parsed.data;
      console.log("transcript:", a.transcript);
      console.log("unclear:", a.unclear, "| fluency:", a.fluency);
      for (const s of a.sentences) {
        console.log(` [${s.verdict.padEnd(7)}] ${s.text}`);
        if (s.verdict !== "good") console.log(`           → ${s.correction}  | ${s.issue}  | alt: ${s.alternatives.join(" / ")}`);
      }
      for (const p of a.pronunciation) console.log(` (pron) ${p.said}: ${p.issue} → ${p.tip}`);
    } catch (err) {
      console.log(`\n=== ${model} × ${file}  FAILED after ${Date.now() - t0} ms`);
      console.log(err instanceof Error ? err.message : err);
    }
  }
}
