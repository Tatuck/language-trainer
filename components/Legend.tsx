import { VERDICT_UNDERLINE } from "./verdict-underline";

const ITEMS = [
  { label: "natural", verdict: "good" },
  { label: "could be better", verdict: "improve" },
  { label: "mistake", verdict: "error" },
] as const;

/** Key for the sentence underlines: each label wears the style it stands for. */
export function Legend({ vertical = false, className = "" }: { vertical?: boolean; className?: string }) {
  return (
    <ul
      aria-label="Underline styles"
      className={`flex text-xs text-zinc-500 dark:text-zinc-400 ${
        vertical ? "flex-col items-start gap-y-2" : "flex-wrap items-center gap-x-4 gap-y-1"
      } ${className}`}
    >
      {ITEMS.map((item) => (
        <li key={item.label}>
          <span className={VERDICT_UNDERLINE[item.verdict]}>{item.label}</span>
        </li>
      ))}
    </ul>
  );
}
