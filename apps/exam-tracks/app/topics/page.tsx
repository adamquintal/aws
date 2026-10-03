import Link from "next/link";
import { requireEnrollment } from "@/lib/session";
import { loadGates, statusesFor } from "@/lib/services/learning";

export const metadata = { title: "Topics" };
export const dynamic = "force-dynamic";

const STATUS_TEXT = { mastered: "Mastered ✓", "explain-back": "Explain it back", current: "Learning now", "coming-soon": "Being written", locked: "Unlocks later" } as const;

export default async function Topics() {
  const { user, track } = await requireEnrollment();
  const gates = await loadGates(user.id, track);
  const statuses = statusesFor(track, gates);
  const domainTitle = Object.fromEntries(track.domains.map((d) => [d.id, d.title]));
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">{track.shortTitle} topics</h1>
      <p className="text-muted">Topics build on each other in this order. Each one opens once the one before it is mastered.</p>
      <ol className="space-y-2">
        {track.topics.map((t) => {
          const s = statuses.get(t.id)!;
          const open = s !== "locked";
          const inner = (
            <div className="flex items-start gap-3">
              <span className="w-6 shrink-0 text-right font-mono text-sm text-muted">{t.index + 1}</span>
              <span className="flex-1">
                <span className="font-medium">{t.title}</span>
                <span className="block text-xs text-muted">{domainTitle[t.domain]} · {t.curriculumItem}</span>
              </span>
              <span className={`shrink-0 text-xs ${s === "mastered" ? "text-good" : s === "current" || s === "explain-back" ? "text-accent" : "text-muted"}`}>{STATUS_TEXT[s]}</span>
            </div>
          );
          return (
            <li key={t.id}>
              {open && t.lesson ? <Link href={`/topics/${t.id}`} className="card block hover:border-accent">{inner}</Link> : <div className="card opacity-70">{inner}</div>}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
