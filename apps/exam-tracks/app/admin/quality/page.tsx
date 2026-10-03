import Link from "next/link";
import { prisma } from "@/lib/db";
import { allItems } from "@/lib/admin/items";
import { setFlagStatus } from "@/app/actions";

export const metadata = { title: "Question quality" };
export const dynamic = "force-dynamic";

export default async function Quality() {
  const items = allItems().filter((i) => i.kind === "question");
  const byQ = new Map(items.map((i) => [(i.body as { id: string }).id, i]));
  const [stats, flags] = await Promise.all([
    prisma.attempt.groupBy({ by: ["questionId", "correct"], where: { context: { not: "mock" } }, _count: true }),
    prisma.flag.findMany({ where: { status: "open" }, orderBy: { createdAt: "desc" }, take: 100 }),
  ]);
  const agg = new Map<string, { total: number; wrong: number }>();
  for (const s of stats) {
    const a = agg.get(s.questionId) ?? { total: 0, wrong: 0 };
    a.total += s._count;
    if (!s.correct) a.wrong += s._count;
    agg.set(s.questionId, a);
  }
  const missed = [...agg.entries()].filter(([, a]) => a.total >= 5).map(([id, a]) => ({ id, ...a, rate: a.wrong / a.total })).sort((x, y) => y.rate - x.rate).slice(0, 25);
  const flagCounts = new Map<string, number>();
  flags.forEach((f) => flagCounts.set(f.questionId, (flagCounts.get(f.questionId) ?? 0) + 1));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Question quality</h1>
      <section className="card">
        <h2 className="font-semibold">Most often missed (≥5 answers)</h2>
        <p className="text-sm text-muted">A very high miss rate can mean a hard topic, or a confusing or wrong question.</p>
        <table className="mt-2 w-full text-left text-sm">
          <thead><tr><th className="py-1">Question</th><th>Miss rate</th><th>Answers</th><th>Open reports</th></tr></thead>
          <tbody>
            {missed.map((m) => {
              const it = byQ.get(m.id);
              return (
                <tr key={m.id} className="border-t border-border">
                  <td className="py-1 pr-2">{it ? <Link className="text-accent underline" href={`/admin/items/${encodeURIComponent(it.itemId)}`}>{m.id}</Link> : `${m.id} (removed)`}</td>
                  <td>{Math.round(m.rate * 100)}%</td><td>{m.total}</td><td>{flagCounts.get(m.id) ?? 0}</td>
                </tr>
              );
            })}
            {!missed.length && <tr><td colSpan={4} className="py-2 text-muted">Not enough answers yet.</td></tr>}
          </tbody>
        </table>
      </section>
      <section className="card">
        <h2 className="font-semibold">Open learner reports</h2>
        <ul className="mt-2 divide-y divide-border">
          {flags.map((f) => {
            const it = byQ.get(f.questionId);
            return (
              <li key={f.id} className="flex flex-wrap items-start gap-3 py-2 text-sm">
                <span className="flex-1">
                  {it ? <Link className="text-accent underline" href={`/admin/items/${encodeURIComponent(it.itemId)}`}>{f.questionId}</Link> : f.questionId} v{f.questionVersion} · <strong>{f.reason}</strong>
                  {f.message && <span className="block text-muted">{f.message}</span>}
                </span>
                {(["resolved", "dismissed"] as const).map((s) => (
                  <form key={s} action={setFlagStatus}><input type="hidden" name="id" value={f.id} /><input type="hidden" name="status" value={s} /><button className="btn-ghost min-h-9 text-xs">{s === "resolved" ? "Resolved" : "Dismiss"}</button></form>
                ))}
              </li>
            );
          })}
          {!flags.length && <li className="py-2 text-sm text-muted">No open reports.</li>}
        </ul>
      </section>
    </div>
  );
}
