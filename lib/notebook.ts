import type { Verdict } from "./schema";
import type { Session } from "./types";

/** A verdict the learner can act on; `good` sentences never reach the notebook. */
export type NotebookVerdict = Exclude<Verdict, "good">;

export type NotebookEntry = {
  sessionId: string;
  topic: string;
  /** The session's `createdAt` (ISO 8601). */
  date: string;
  /** The sentence as spoken. */
  text: string;
  verdict: NotebookVerdict;
  issue: string | null;
  correction: string | null;
  alternatives: string[];
};

function isActionable(verdict: Verdict): verdict is NotebookVerdict {
  return verdict !== "good";
}

/**
 * Every sentence that was marked `improve` or `error`, newest session first and in spoken order
 * within a session. Pending or failed learner turns have no analysis and contribute nothing.
 * Pure: the given sessions are not mutated and no arrays are shared with the result.
 */
export function buildNotebook(sessions: Session[]): NotebookEntry[] {
  const ordered = [...sessions].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const entries: NotebookEntry[] = [];
  for (const session of ordered) {
    for (const turn of session.turns) {
      if (turn.role !== "user" || turn.analysis === null) continue;
      for (const sentence of turn.analysis.sentences) {
        if (!isActionable(sentence.verdict)) continue;
        entries.push({
          sessionId: session.id,
          topic: session.topic,
          date: session.createdAt,
          text: sentence.text,
          verdict: sentence.verdict,
          issue: sentence.issue,
          correction: sentence.correction,
          alternatives: [...sentence.alternatives],
        });
      }
    }
  }
  return entries;
}
