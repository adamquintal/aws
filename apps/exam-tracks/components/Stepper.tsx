const STEPS = ["Learn", "Practice", "Explain"] as const;

/** Learn → Practice → Explain progress for a topic. `done` marks completed steps. */
export function Stepper({ current, done = [] }: { current?: (typeof STEPS)[number]; done?: string[] }) {
  return (
    <ol aria-label="Topic steps" className="grid grid-cols-3 gap-1.5">
      {STEPS.map((s) => {
        const isCur = s === current;
        const isDone = done.includes(s);
        return (
          <li key={s} aria-current={isCur ? "step" : undefined} className="flex flex-col gap-2">
            <div className={`h-[3px] rounded-full ${isDone ? "bg-accent" : isCur ? "bg-fg" : "bg-track"}`} />
            <span className={`text-[13px] ${isCur ? "font-semibold text-fg" : isDone ? "text-accent" : "text-muted"}`}>{s}</span>
          </li>
        );
      })}
    </ol>
  );
}
