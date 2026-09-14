import type { Verdict } from "@/lib/schema";

/**
 * Underline for each verdict, on a sentence and in the legend. Style carries the meaning on
 * its own (thin solid / dotted / wavy); colour only reinforces it.
 */
export const VERDICT_UNDERLINE: Record<Verdict, string> = {
  good: "underline underline-offset-4 decoration-solid decoration-1 decoration-emerald-500/50",
  improve: "underline underline-offset-4 decoration-dotted decoration-2 decoration-amber-500",
  error: "underline underline-offset-4 decoration-wavy decoration-1 decoration-red-500",
};
