import Link from "next/link";
import { requireEnrollment } from "@/lib/session";
import { getProgress } from "@/lib/services/progress";
import { currentTopic } from "@/lib/services/learning";

export const metadata = { title: "Today" };
export const dynamic = "force-dynamic";

function greeting(tz: string) {
  const h = Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: tz }).format(new Date()));
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export default async function Today() {
  const { user, enrollment, track } = await requireEnrollment();
  const p = await getProgress(user.id, user.timezone, track, enrollment);
  const cur = currentTopic(track, p.statuses);
  const curStatus = cur ? p.statuses.get(cur.id) : null;
  const run = cur ? p.gates.get(cur.id)?.run ?? 0 : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{greeting(user.timezone)}{user.name ? `, ${user.name}` : ""}.</h1>
        <p className="mt-1 text-muted">
          {p.streak.studiedToday
            ? "You've already studied today. Anything more is a bonus."
            : p.streak.graceUsedToday
              ? `Your ${p.streak.current}-day streak is safe. One missed day never breaks it.`
              : "About 10 questions, at your own pace."}
        </p>
      </div>

      <section className="card space-y-4" aria-labelledby="session-h">
        <h2 id="session-h" className="text-lg font-semibold">Today's session</h2>
        {curStatus === "explain-back" && cur ? (
          <>
            <p>You've answered {track.mastery.runTarget} in a row on <strong>{cur.title}</strong>. One last step: explain it in your own words.</p>
            <Link href={`/topics/${cur.id}/explain`} className="btn-primary">Explain it back</Link>
          </>
        ) : (
          <>
            <ul className="space-y-1 text-sm text-muted">
              {p.masteredCount > 0 && <li>• A short warm-up from topics you've mastered</li>}
              {p.dueCount > 0 && <li>• {p.dueCount} review{p.dueCount === 1 ? "" : "s"} due</li>}
              {cur && curStatus === "current" && <li>• Practice on <strong className="text-fg">{cur.title}</strong> ({run}/{track.mastery.runTarget} in a row)</li>}
              {curStatus === "coming-soon" && <li>• The next topic ({cur?.title}) is still being written. Reviews keep you sharp meanwhile.</li>}
            </ul>
            <div className="flex flex-wrap gap-3">
              <Link href="/learn" className="btn-primary">Start session</Link>
              {cur && curStatus === "current" && (
                <Link href={`/topics/${cur.id}`} className="btn-ghost">{p.gates.get(cur.id)?.lessonViewedAt ? "Re-read the lesson" : "Read the lesson first"}</Link>
              )}
            </div>
          </>
        )}
      </section>

      <section className="grid gap-3 sm:grid-cols-3" aria-label="At a glance">
        <Stat label="Streak" value={`${p.streak.current} day${p.streak.current === 1 ? "" : "s"}`} />
        <Stat label="Topics mastered" value={`${p.masteredCount} of ${p.totalTopics}`} />
        <Stat label="Readiness" value={`${Math.round(p.readiness.score)}%`} href="/dashboard" />
      </section>

      {p.weakest.length > 0 && (
        <section className="card" aria-labelledby="next-h">
          <h2 id="next-h" className="font-semibold">Good next steps</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {p.weakest.map((w) => (
              <li key={w.topicId}>
                <Link className="text-accent underline" href={`/topics/${w.topicId}`}>Revisit “{w.title}”</Link>
                <span className="text-muted">. A quick re-read usually lifts this.</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Stat({ label, value, href }: { label: string; value: string; href?: string }) {
  const body = (
    <>
      <div className="label">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </>
  );
  return href ? <Link href={href} className="card block hover:border-accent">{body}</Link> : <div className="card">{body}</div>;
}
