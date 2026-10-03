import Link from "next/link";
import { requireEnrollment } from "@/lib/session";
import { getProgress } from "@/lib/services/progress";
import { addDays } from "@/lib/engine/dates";
import { Sparkline } from "@/components/Charts";
import { TabBar } from "@/components/TabBar";
import { IconSettings } from "@/components/Icons";

export const metadata = { title: "Progress" };
export const dynamic = "force-dynamic";

const fmtDay = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" });
const fmtTime = (ms: number) => { const m = Math.round(ms / 60000); return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`; };
const pct = (n: number | null) => (n == null ? "–" : `${Math.round(n * 100)}%`);

export default async function Progress() {
  const { user, enrollment, track } = await requireEnrollment();
  const p = await getProgress(user.id, user.timezone, track, enrollment);
  const r = p.readiness;
  const proj = p.projection;
  const domainTitle = Object.fromEntries(track.domains.map((d) => [d.id, d.title]));
  const threshold = track.readiness.domainThreshold;

  const weekAgo = addDays(p.today, -7);
  const base = [...p.trend].reverse().find((t) => t.day <= weekAgo) ?? p.trend[0];
  const delta = Math.round(r.score - (base?.score ?? 0));

  let outlook = "";
  if (proj.projectedReadyDay) {
    outlook = `At your pace you’ll be ready around ${fmtDay(proj.projectedReadyDay)}`;
    if (proj.examDay && proj.outlook === "on-track") outlook += ", comfortably before your exam.";
    else if (proj.examDay && proj.outlook === "tight") outlook += ", just before your exam. A little extra each week gives you room.";
    else if (proj.examDay && proj.outlook === "behind") outlook += `, after your exam date. About ${proj.neededPerWeek} topics a week would close the gap, or move the date. Both are fine.`;
    else outlook += ".";
  } else {
    outlook = "A ready date appears after your first week and first mastered topic.";
  }
  const started = p.sinceDayOne.filter((s) => s.firstCount > 0);

  return (
    <main id="main" className="page pt-14">
      <div className="flex items-start justify-between">
        <p className="eyebrow">Readiness</p>
        <Link href="/settings" aria-label="Settings" className="-mr-2.5 -mt-3 flex h-11 w-11 items-center justify-center text-muted"><IconSettings size={20} /></Link>
      </div>
      <div className="mt-1 flex items-baseline gap-3">
        <span className="font-serif text-[96px] leading-none">{Math.round(r.score)}<span className="text-[48px]">%</span></span>
        {delta > 0 && <span className="text-[15px] text-accent">+{delta} this week</span>}
      </div>
      <p className="mt-3 text-[16px] leading-relaxed text-soft">
        {r.readyToBook ? (
          <span className="font-semibold text-accent">Ready to book. Every domain is above {Math.round(threshold * 100)}% and you’ve passed a mock exam.</span>
        ) : (
          <>{r.nextSteps[0] ? <>Next: {r.nextSteps[0].replace(/\.$/, "")}. </> : null}{outlook}</>
        )}
      </p>
      {p.trend.length > 1 && <div className="mt-6"><Sparkline points={p.trend} label="Readiness over time" /></div>}

      <div className="mt-7 grid grid-cols-3 border-y border-border">
        <Stat value={String(p.streak.current)} label="day streak" />
        <Stat value={fmtTime(p.totalActiveMs)} label="studied" border />
        <Stat value={String(p.dueCount)} label="reviews due" border />
      </div>

      <section aria-labelledby="dom" className="mt-9 flex flex-col gap-5">
        <div className="flex items-baseline justify-between">
          <h2 id="dom" className="eyebrow">By exam domain</h2>
          <span className="text-xs text-muted">line = {Math.round(threshold * 100)}% target</span>
        </div>
        {r.domains.map((d) => {
          const topics = track.topics.filter((t) => t.domain === d.domainId).length;
          const masteredN = Math.round(d.coverage * topics);
          return (
            <div key={d.domainId} className="flex flex-col gap-2">
              <div className="flex justify-between text-[15px]">
                <span>{d.title} <span className="text-muted">{d.weight}%</span></span>
                <span className="font-semibold">{pct(d.recentAccuracy)}</span>
              </div>
              <div className="relative h-2 rounded-full bg-track" role="img" aria-label={`${d.title}: ${pct(d.recentAccuracy)} recent accuracy, target ${Math.round(threshold * 100)}%`}>
                <div className="h-2 rounded-full bg-accent" style={{ width: `${(d.recentAccuracy ?? 0) * 100}%` }} />
                <div className="absolute -top-1 h-4 w-0.5 bg-fg" style={{ left: `${threshold * 100}%` }} />
              </div>
              <span className="text-[13px] text-muted">
                {d.recentCount ? `${pct(d.recentAccuracy)} over your last ${d.recentCount === 1 ? "answer" : `${d.recentCount} answers`} · ` : "Not started · "}{masteredN} of {topics} topics mastered
              </span>
            </div>
          );
        })}
      </section>

      {started.length > 0 && (
        <section aria-labelledby="sdo" className="mt-10">
          <h2 id="sdo" className="eyebrow mb-2">Since day one</h2>
          <ul className="m-0 list-none border-t border-border p-0">
            {started.map((s) => (
              <li key={s.domainId} className="row">
                <span>{domainTitle[s.domainId]}</span>
                <span><span className="text-muted">{pct(s.firstAccuracy)}</span> → <b className="font-semibold">{pct(s.recentAccuracy)}</b></span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[13px] text-muted">Your first try at each question, compared with your recent answers.</p>
        </section>
      )}

      {p.weakest.length > 0 && (
        <section aria-labelledby="weak" className="mt-10">
          <h2 id="weak" className="eyebrow mb-2">Worth a quick revisit</h2>
          <ul className="m-0 list-none border-t border-border p-0">
            {p.weakest.map((w) => (
              <li key={w.topicId}>
                <Link href={`/topics/${w.topicId}`} className="row hover:opacity-80"><span>{w.title}</span><span className="text-muted">{Math.round(w.accuracy * 100)}% recently</span></Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="h-8" />
      <TabBar active="progress" />
    </main>
  );
}

function Stat({ value, label, border = false }: { value: string; label: string; border?: boolean }) {
  return (
    <div className={`flex flex-col gap-0.5 py-4 ${border ? "border-l border-border pl-4" : ""}`}>
      <span className="font-serif text-[28px] leading-tight">{value}</span>
      <span className="text-[13px] text-muted">{label}</span>
    </div>
  );
}
