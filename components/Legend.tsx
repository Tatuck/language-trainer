const ITEMS = [
  { label: "natural", dot: "bg-emerald-500/50" },
  { label: "could be better", dot: "bg-amber-500" },
  { label: "mistake", dot: "bg-red-500" },
] as const;

/** Key for the sentence underline colours. */
export function Legend({ vertical = false, className = "" }: { vertical?: boolean; className?: string }) {
  return (
    <ul
      aria-label="Underline colours"
      className={`flex text-xs text-zinc-500 dark:text-zinc-400 ${
        vertical ? "flex-col items-start gap-y-2" : "flex-wrap items-center gap-x-4 gap-y-1"
      } ${className}`}
    >
      {ITEMS.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5">
          <span aria-hidden="true" className={`inline-block size-2 rounded-full ${item.dot}`} />
          {item.label}
        </li>
      ))}
    </ul>
  );
}
