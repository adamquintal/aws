const LABEL: Record<string, string> = { draft: "Draft", "source-checked": "Source-checked", "human-verified": "Human-verified" };

export function StatusBadge({ status }: { status: string }) {
  const tone = status === "human-verified" ? "border-accent text-accent" : status === "source-checked" ? "border-border text-soft" : "border-border text-muted";
  return <span className={`inline-block rounded-full border px-2 py-0.5 text-xs ${tone}`}>{LABEL[status] ?? status}</span>;
}
