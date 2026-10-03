import Link from "next/link";
import { prisma } from "@/lib/db";
import { allItems, FILE_STATUS } from "@/lib/admin/items";
import { StatusBadge } from "@/components/StatusBadge";

export const metadata = { title: "Review queue" };
export const dynamic = "force-dynamic";

export default async function ReviewQueue({ searchParams }: { searchParams: Promise<{ status?: string; track?: string }> }) {
  const { status = "pending", track } = await searchParams;
  const items = allItems().filter((i) => !track || i.trackId === track);
  const decisions = await prisma.reviewDecision.findMany({ orderBy: { createdAt: "desc" }, include: { reviewer: { select: { email: true, name: true } } } });
  const latest = new Map<string, (typeof decisions)[number]>();
  for (const d of decisions) if (!latest.has(`${d.itemId}@${d.version}`)) latest.set(`${d.itemId}@${d.version}`, d);

  // Effective status: a reviewer decision on this exact version overrides the file until it's applied.
  const rows = items.map((i) => {
    const d = latest.get(`${i.itemId}@${i.version}`);
    return { ...i, effective: d ? FILE_STATUS[d.status] : i.status, decision: d };
  });
  const filtered = rows.filter((r) => (status === "pending" ? r.effective !== "human-verified" : status === "all" ? true : r.effective === status));
  const counts = { draft: 0, "source-checked": 0, "human-verified": 0 } as Record<string, number>;
  rows.forEach((r) => counts[r.effective]++);
  const unapplied = rows.filter((r) => r.decision && !r.decision.appliedAt && FILE_STATUS[r.decision.status] !== r.status).length;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Content review</h1>
      <p className="text-sm text-muted">
        draft → source-checked (written from a fetched doc) → human-verified (a person checked it against the source). Only reviewers can set human-verified.
      </p>
      <p className="text-sm">
        {counts.draft} draft · {counts["source-checked"]} source-checked · {counts["human-verified"]} human-verified
        {unapplied > 0 && <> · <strong>{unapplied}</strong> decisions not yet written to the repo. Run <code>npm run content:apply-reviews</code> and commit.</>}
      </p>
      <div className="flex flex-wrap gap-2 text-sm">
        {["pending", "draft", "source-checked", "human-verified", "all"].map((s) => (
          <Link key={s} href={`/admin?status=${s}`} className={`rounded-full border px-3 py-1 ${s === status ? "border-accent text-accent" : "border-border"}`}>{s}</Link>
        ))}
      </div>
      <ul className="divide-y divide-border rounded-2xl border border-border bg-surface">
        {filtered.slice(0, 300).map((r) => (
          <li key={r.itemId}>
            <Link href={`/admin/items/${encodeURIComponent(r.itemId)}`} className="flex items-start gap-3 p-3 hover:bg-bg">
              <span className="flex-1">
                <span className="line-clamp-2">{r.title}</span>
                <span className="block text-xs text-muted">{r.itemId} · v{r.version}</span>
              </span>
              <StatusBadge status={r.effective} />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
