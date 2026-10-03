/** Ten (or `target`) segments showing the current in-a-row run toward mastery. */
export function RunBar({ run, target }: { run: number; target: number }) {
  return (
    <div role="img" aria-label={`${run} of ${target} in a row`} className="grid gap-1" style={{ gridTemplateColumns: `repeat(${target}, minmax(0, 1fr))` }}>
      {Array.from({ length: target }, (_, i) => (
        <div key={i} className={`h-1.5 rounded-full ${i < run ? "bg-accent" : "bg-track"}`} />
      ))}
    </div>
  );
}
