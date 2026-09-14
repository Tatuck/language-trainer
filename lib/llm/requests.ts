import { z } from "zod";
import { LEVELS, FEEDBACK_LANGS } from "@/lib/prompts";

/** ~60 s of 16 kHz mono 16-bit WAV is ~1.9 MB raw → ~2.6 MB base64; 4 M leaves margin. */
export const MAX_WAV_BASE64_CHARS = 4_000_000;
export const MAX_TEXT_CHARS = 4000;
export const MAX_TOPIC_CHARS = 200;
export const MAX_HISTORY_ENTRIES = 50;

const AudioInputSchema = z.object({ wavBase64: z.string().min(1).max(MAX_WAV_BASE64_CHARS) });
const TextField = z.string().min(1).max(MAX_TEXT_CHARS);

/** Body of POST /api/turn/analyze. Exactly one of audio / text must be set. */
export const AnalyzeRequestSchema = z
  .object({
    audio: AudioInputSchema.optional(),
    text: TextField.optional(),
    hint: TextField.optional(),
    level: z.enum(LEVELS),
    lang: z.enum(FEEDBACK_LANGS),
  })
  .refine((value) => Boolean(value.audio) !== Boolean(value.text), {
    message: "Provide exactly one of audio or text",
  });

const HistoryMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().max(MAX_TEXT_CHARS),
});

/** Body of POST /api/turn/reply. */
export const ReplyRequestSchema = z.object({
  audio: AudioInputSchema.optional(),
  text: TextField.optional(),
  hint: TextField.optional(),
  history: z.array(HistoryMessageSchema).max(MAX_HISTORY_ENTRIES),
  topic: z.string().min(1).max(MAX_TOPIC_CHARS),
  level: z.enum(LEVELS),
});
