import { z } from "zod";

export const VERDICTS = ["good", "improve", "error"] as const;
export type Verdict = (typeof VERDICTS)[number];

// Nullable (not optional) so the JSON schema can be `strict`: every key present, null when absent.
export const SentenceSchema = z.object({
  text: z.string().describe("Verbatim sentence as spoken, a substring of transcript"),
  verdict: z.enum(VERDICTS),
  issue: z.string().nullable().describe("What is wrong or unnatural, <= 20 words, null if verdict is good"),
  correction: z.string().nullable().describe("Natural version keeping the meaning, null if verdict is good"),
  alternatives: z.array(z.string()).max(3).describe("0-3 other natural ways to say it"),
});

export const PronunciationSchema = z.object({
  said: z.string().describe("The word or short phrase"),
  issue: z.string().describe("What it sounded like"),
  tip: z.string().describe("One concrete tip"),
});

export const AnalysisSchema = z.object({
  transcript: z.string().describe("Punctuated transcript of exactly what was said"),
  unclear: z.boolean().describe("True if the audio was unintelligible"),
  sentences: z.array(SentenceSchema),
  pronunciation: z.array(PronunciationSchema).max(3),
  fluency: z.string().nullable().describe("One line on pace, fillers or hesitation, null if nothing notable"),
});

export type Sentence = z.infer<typeof SentenceSchema>;
export type Pronunciation = z.infer<typeof PronunciationSchema>;
export type Analysis = z.infer<typeof AnalysisSchema>;

export const analysisJsonSchema = z.toJSONSchema(AnalysisSchema, { target: "draft-7" });

export type Span = { text: string; sentenceIndex: number | null };

/**
 * Walk the transcript and place each sentence at its first occurrence after the previous one.
 * Text between placed sentences becomes a plain span; sentences that cannot be placed are skipped.
 */
export function mapSentencesToSpans(transcript: string, sentences: string[]): Span[] {
  const spans: Span[] = [];
  let cursor = 0;
  sentences.forEach((sentence, sentenceIndex) => {
    let start = transcript.indexOf(sentence, cursor);
    if (start === -1) {
      start = transcript.toLowerCase().indexOf(sentence.toLowerCase(), cursor);
    }
    if (start === -1) return;
    if (start > cursor) spans.push({ text: transcript.slice(cursor, start), sentenceIndex: null });
    const end = start + sentence.length;
    spans.push({ text: transcript.slice(start, end), sentenceIndex });
    cursor = end;
  });
  if (cursor < transcript.length) spans.push({ text: transcript.slice(cursor), sentenceIndex: null });
  return spans;
}
