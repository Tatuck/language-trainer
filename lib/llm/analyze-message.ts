import type { UserContent } from "./content";

/**
 * Builds the learner's user-turn content for the analysis call: the audio (when present) plus an
 * instruction part, or a plain instruction referencing the written text.
 */
export function buildAnalyzeUserContent(input: { audio?: { wavBase64: string }; text?: string; hint?: string }): UserContent {
  if (input.audio) {
    const base = "Analyse what I just said.";
    const text = input.hint
      ? `${base}\nRough automatic transcript (hint only, audio is the truth): ${input.hint}`
      : base;
    return [
      { type: "input_audio", input_audio: { data: input.audio.wavBase64, format: "wav" } },
      { type: "text", text },
    ];
  }
  return `Analyse what I just wrote:\n${input.text ?? ""}`;
}
