import Link from "next/link";
import { requireEnrollment } from "@/lib/session";
import { getProgress } from "@/lib/services/progress";
import { Bars, PairedBars, TrendChart } from "@/components/Charts";

export const metadata = { title: "Progress" };
export const dynamic = "force-dynamic";

const fmtDay = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const fmtTime = (ms: number) => { const m = Math.round(ms / 60000); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`; };

export default async function Dashboard() {
  const { user, enrollment, track } = await requireEnrollment();
  const p = await getProgress(user.id, user.timezone, track, enrollment);
  const r = p.readiness;
  const domainTitle = Object.fromEntries(track.domains.map((d) => [d.id, d.title]));
  const proj = p.projection;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Your progress</h1>

      <section className="card space-y-3" aria-labelledby="ready-h">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="ready-h" className="text-lg font-semibold">Readiness</h2>
          <span className="text-3xl font-semibold">{Math.round(r.score)}%</span>
        </div>
        <p className="text-sm text-muted">
          Weighted by exam domain and counting every topic in the curriculum, so it rises steadily as you master topics and keep your accuracy up. It is honest on purpose.
        </p>
        <TrendChart points={p.trend} label="Readiness over time" />
        {r.readyToBook ? (
          <p className="rounded-xl bg-bg p-3 font-medium text-good">✓ Ready to book. Every domain is above {Math.round(track.readiness.domainThreshold * 100)}% and you've passed a mock exam.</p>
        ) : (
          <div className="rounded-xl bg-bg p-3 text-sm">
            <p className="font-medium">What's left before "ready to book":</p>
            <ul className="mt-1 list-disc pl-5">{r.nextSteps.slice(0, 4).map((s) => <li key={s}>{s}</li>)}</ul>
            {track.kind === "exam" && <p className="mt-2 text-muted">Mock exams are coming in the next update.</p>}
          </div>
        )}
      </section>

      <section className="grid gap-3 sm:grid-cols-4" aria-label="Summary">
        <Tile label="Current streak" value={`${p.streak.current} days`} sub={`Longest ${p.streak.longest}`} />
        <Tile label="Study days" value={String(p.studyDays.length)} />
        <Tile label="Time studied" value={fmtTime(p.totalActiveMs)} />
        <Tile label="Reviews due" value={String(p.dueCount)} />
      </section>

      <section className="card space-y-3" aria-labelledby="domains-h">
        <h2 id="domains-h" className="text-lg font-semibold">By domain</h2>
        <Bars
          label="Domain readiness"
          threshold={track.readiness.domainThreshold}
          rows={r.domains.map((d) => ({
            key: d.domainId,
            label: `${d.title} (${d.weight}%)`,
            value: d.recentAccuracy,
            detail: `Recent accuracy ${d.recentAccuracy == null ? "–" : Math.round(d.recentAccuracy * 100) + "%"} over ${d.recentCount} answers · ${Math.round(d.coverage * 100)}% of topics mastered`,
          }))}
        />
      </section>

      <section className="card space-y-3" aria-labelledby="sdo-h">
        <h2 id="sdo-h" className="text-lg font-semibold">Since day one</h2>
        <p className="text-sm text-muted">How you did the first time you saw each question, compared with how you're doing now.</p>
        <PairedBars rows={p.sinceDayOne.map((s) => ({ key: s.domainId, label: domainTitle[s.domainId], first: s.firstAccuracy, recent: s.recentAccuracy }))} />
      </section>

      <section className="card space-y-3" aria-labelledby="pace-h">
        <h2 id="pace-h" className="text-lg font-semibold">Pace</h2>
        <p>{p.masteredCount} of {p.totalTopics} topics mastered · about {proj.pacePerWeek} topics per week recently.</p>
        {proj.projectedReadyDay ? (
          <p>At this pace you'd be ready around <strong>{fmtDay(proj.projectedReadyDay)}</strong> (including a week for final review).</p>
        ) : (
          <p className="text-muted">A projected ready date appears after your first week and first mastered topic.</p>
        )}
        {proj.examDay && (
          <p className="text-sm">
            Exam date: {fmtDay(proj.examDay)}.{" "}
            {proj.outlook === "on-track" && "You're on track with room to spare."}
            {proj.outlook === "tight" && "It's close. A little extra practice each week would give you breathing room."}
            {proj.outlook === "behind" && proj.neededPerWeek != null && `Aiming for about ${proj.neededPerWeek} topics a week would get you there, or you could move the date. Both are fine choices.`}
            {proj.outlook === "unknown" && proj.neededPerWeek != null && `That's about ${proj.neededPerWeek} topics a week.`}
          </p>
        )}
      </section>

      {p.weakest.length > 0 && (
        <section className="card" aria-labelledby="weak-h">
          <h2 id="weak-h" className="text-lg font-semibold">Where a little practice goes furthest</h2>
          <ul className="mt-2 space-y-1">
            {p.weakest.map((w) => (
              <li key={w.topicId}><Link href={`/topics/${w.topicId}`} className="text-accent underline">{w.title}</Link> <span className="text-sm text-muted">({Math.round(w.accuracy * 100)}% recently)</span></li>
            ))}
          </ul>
        </section>
      )}

      <section className="card space-y-3" aria-labelledby="topics-h">
        <h2 id="topics-h" className="text-lg font-semibold">By topic</h2>
        <Bars
          label="Topic accuracy"
          rows={p.topicAccuracy.filter((t) => t.attempts > 0).map((t) => ({ key: t.topicId, label: t.title, value: t.accuracy, detail: `${t.attempts} answers · ${t.status}` }))}
        />
        <p className="text-sm text-muted">{p.topicAccuracy.filter((t) => t.attempts === 0).length} topics not started yet.</p>
      </section>
    </div>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card">
      <div className="label">{label}</div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
      {sub && <div className="text-xs text-muted">{sub}</div>}
    </div>
  );
}
