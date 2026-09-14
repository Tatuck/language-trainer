import { z } from "zod";
import { LEVELS, FEEDBACK_LANGS } from "@/lib/prompts";

const AudioInputSchema = z.object({ wavBase64: z.string().min(1) });

/** Body of POST /api/turn/analyze. Exactly one of audio / text must be set. */
export const AnalyzeRequestSchema = z
  .object({
    audio: AudioInputSchema.optional(),
    text: z.string().min(1).optional(),
    hint: z.string().min(1).optional(),
    level: z.enum(LEVELS),
    lang: z.enum(FEEDBACK_LANGS),
  })
  .refine((value) => Boolean(value.audio) !== Boolean(value.text), {
    message: "Provide exactly one of audio or text",
  });

export type AnalyzeRequestBody = z.infer<typeof AnalyzeRequestSchema>;

const HistoryMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string(),
});

/** Body of POST /api/turn/reply. */
export const ReplyRequestSchema = z.object({
  audio: AudioInputSchema.optional(),
  text: z.string().min(1).optional(),
  hint: z.string().min(1).optional(),
  history: z.array(HistoryMessageSchema),
  topic: z.string().min(1),
  level: z.enum(LEVELS),
});

export type ReplyRequestBody = z.infer<typeof ReplyRequestSchema>;
