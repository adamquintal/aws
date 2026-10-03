import { notFound } from "next/navigation";
import { diffLines } from "diff";
import { prisma } from "@/lib/db";
import { allItems, DB_STATUS, renderForDiff } from "@/lib/admin/items";
import { recordReview } from "@/app/actions";
import { StatusBadge } from "@/components/StatusBadge";

export const dynamic = "force-dynamic";

export default async function ItemReview({ params, searchParams }: { params: Promise<{ itemId: string }>; searchParams: Promise<{ against?: string }> }) {
  const itemId = decodeURIComponent((await params).itemId);
  const { against } = await searchParams;
  const item = allItems().find((i) => i.itemId === itemId);
  if (!item) notFound();

  const [snapshots, decisions, flags, stats] = await Promise.all([
    prisma.contentSnapshot.findMany({ where: { itemId }, orderBy: { version: "desc" } }),
    prisma.reviewDecision.findMany({ where: { itemId }, orderBy: { createdAt: "desc" }, include: { reviewer: { select: { email: true, name: true } } } }),
    item.kind === "question" ? prisma.flag.findMany({ where: { questionId: (item.body as { id: string }).id }, orderBy: { createdAt: "desc" }, take: 20 }) : [],
    item.kind === "question" ? prisma.attempt.groupBy({ by: ["correct"], where: { questionId: (item.body as { id: string }).id }, _count: true }) : [],
  ]);

  const current = renderForDiff(item.body, item.sources);
  const older = snapshots.filter((s) => s.version < item.version);
  const base = older.find((s) => String(s.version) === against) ?? older[0];
  const diff = base ? diffLines(renderForDiff(base.body, (base.body as { sources?: [] }).sources ?? []), current) : null;
  const total = stats.reduce((s, x) => s + x._count, 0);
  const right = stats.find((x) => x.correct)?._count ?? 0;

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <p className="text-sm text-muted">{item.itemId} · v{item.version} · {item.kind}</p>
        <h1 className="break-words text-xl font-semibold">{item.title}</h1>
        <div className="flex items-center gap-2"><span className="text-sm">In repo:</span> <StatusBadge status={item.status} />{item.reviewer && <span className="text-sm text-muted">by {item.reviewer}</span>}</div>
        {decisions[0] && decisions[0].version === item.version && !decisions[0].appliedAt && (
          <p className="text-sm">Latest decision: <strong>{decisions[0].status.replace("_", "-")}</strong> (not yet written to the repo. Run <code>npm run content:apply-reviews</code>)</p>
        )}
        {total > 0 && <p className="text-sm text-muted">{total} answers · {Math.round((right / total) * 100)}% correct</p>}
      </div>

      <section className="card space-y-2">
        <h2 className="font-semibold">Check against these sources</h2>
        <ul className="list-disc pl-5 text-sm">
          {item.sources.map((s) => <li key={s.url}><a href={s.url} target="_blank" rel="noreferrer" className="text-accent underline">{s.title}</a> <span className="break-all text-muted">{s.url}</span></li>)}
        </ul>
      </section>

      <section className="card space-y-2">
        <h2 className="font-semibold">{diff ? `Changes since v${base!.version}` : "Content"}</h2>
        {older.length > 1 && (
          <form className="text-sm">
            <label htmlFor="against" className="label">Compare with </label>
            <select id="against" name="against" defaultValue={String(base?.version)} className="input inline-block w-auto">
              {older.map((s) => <option key={s.version} value={s.version}>v{s.version}</option>)}
            </select>
            <button className="btn-ghost ml-2 min-h-9">Show</button>
          </form>
        )}
        <pre className="max-h-[32rem] overflow-auto rounded-xl bg-bg p-3 text-xs leading-snug">
          {diff
            ? diff.map((part, i) => (
                <span key={i} className={part.added ? "bg-good/15 text-good" : part.removed ? "bg-gentle/15 text-gentle line-through" : ""}>
                  {part.value.split("\n").filter((l, k, a) => k < a.length - 1 || l).map((l) => `${part.added ? "+ " : part.removed ? "- " : "  "}${l}\n`).join("")}
                </span>
              ))
            : current}
        </pre>
        {!snapshots.length && <p className="text-xs text-muted">No stored versions yet. Run the seed to snapshot content.</p>}
      </section>

      <form action={recordReview} className="card space-y-3">
        <h2 className="font-semibold">Your review of v{item.version}</h2>
        <input type="hidden" name="itemId" value={item.itemId} />
        <input type="hidden" name="version" value={item.version} />
        <fieldset className="flex flex-wrap gap-3">
          <legend className="sr-only">Status</legend>
          {Object.entries(DB_STATUS).map(([label, value]) => (
            <label key={value} className="flex items-center gap-2"><input type="radio" name="status" value={value} defaultChecked={value === "human_verified"} /> {label}</label>
          ))}
        </fieldset>
        <label htmlFor="note" className="label">Note (what you checked, or what needs fixing)</label>
        <textarea id="note" name="note" className="input min-h-20" />
        <button className="btn-primary">Save review</button>
      </form>

      {decisions.length > 0 && (
        <section className="card">
          <h2 className="font-semibold">Review history</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {decisions.map((d) => (
              <li key={d.id}>v{d.version}: <strong>{d.status.replace("_", "-")}</strong> by {d.reviewer.name ?? d.reviewer.email} on {d.createdAt.toISOString().slice(0, 10)}{d.appliedAt ? " (applied to repo)" : ""}{d.note ? `: ${d.note}` : ""}</li>
            ))}
          </ul>
        </section>
      )}

      {flags.length > 0 && (
        <section className="card">
          <h2 className="font-semibold">Learner reports</h2>
          <ul className="mt-2 space-y-1 text-sm">{flags.map((f) => <li key={f.id}>v{f.questionVersion} · {f.reason} · {f.status}{f.message ? `: ${f.message}` : ""}</li>)}</ul>
        </section>
      )}
    </div>
  );
}
