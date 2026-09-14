import { z } from "zod";
import { MAX_TOPIC_CHARS } from "./llm/requests";
import { FEEDBACK_LANGS, LEVELS } from "./prompts";
import { AnalysisSchema } from "./schema";
import type { Session, Turn } from "./types";

/** Message shown on a learner turn whose analysis never finished before the page went away. */
export const INTERRUPTED_ANALYSIS = "Analysis was interrupted before it finished. Say it again to retry.";

export const MAX_SESSION_TURNS = 500;

const UserTurnSchema = z.object({
  role: z.literal("user"),
  id: z.string().min(1),
  hint: z.string().nullable(),
  analysis: AnalysisSchema.nullable(),
  error: z.string().nullable(),
});

const BotTurnSchema = z.object({
  role: z.literal("bot"),
  id: z.string().min(1),
  text: z.string(),
  streaming: z.boolean(),
  error: z.string().nullable(),
});

/** The `Session` contract as the API accepts it: every field present, bounded topic and turn count. */
export const SessionSchema = z.object({
  id: z.string().min(1).max(64),
  topic: z.string().min(1).max(MAX_TOPIC_CHARS),
  level: z.enum(LEVELS),
  lang: z.enum(FEEDBACK_LANGS),
  createdAt: z.iso.datetime(),
  turns: z.array(z.discriminatedUnion("role", [UserTurnSchema, BotTurnSchema])).max(MAX_SESSION_TURNS),
});

/** Bot turns written before `error` existed lack the field; reading fills it with null. */
const StoredBotTurnSchema = BotTurnSchema.extend({ error: z.string().nullable().default(null) });

const StoredSessionSchema = SessionSchema.extend({
  turns: z.array(z.discriminatedUnion("role", [UserTurnSchema, StoredBotTurnSchema])).max(MAX_SESSION_TURNS),
});

/** A session as it may sit in storage (localStorage or the DB), normalised; null when not session-shaped. */
export function parseStoredSession(value: unknown): Session | null {
  const result = StoredSessionSchema.safeParse(value);
  return result.success ? result.data : null;
}

/**
 * Copy of a turn with no in-flight state, so a reload never shows a stuck spinner.
 * Returns null for a bot turn that never received any text (nothing worth keeping).
 */
function settleTurn(turn: Turn): Turn | null {
  if (turn.role === "bot") {
    if (!turn.streaming) return turn;
    if (turn.text.length === 0) return null;
    return { ...turn, streaming: false };
  }
  if (turn.analysis === null && turn.error === null) {
    return { ...turn, error: INTERRUPTED_ANALYSIS };
  }
  return turn;
}

/** Copy of the session with every turn settled (see `settleTurn`). The given object is not mutated. */
export function settleSession(session: Session): Session {
  const turns: Turn[] = [];
  for (const turn of session.turns) {
    const settled = settleTurn(turn);
    if (settled) turns.push(settled);
  }
  return { ...session, turns };
}
