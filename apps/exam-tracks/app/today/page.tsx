import Link from "next/link";
import { requireEnrollment } from "@/lib/session";
import { getProgress } from "@/lib/services/progress";
import { buildDailySession, currentTopic } from "@/lib/services/learning";
import { listExams } from "@/lib/services/exams";
import { addDays } from "@/lib/engine/dates";
import { TabBar } from "@/components/TabBar";
import { RunBar } from "@/components/RunBar";
import { IconArrow, IconFlame, IconSettings } from "@/components/Icons";

export const metadata = { title: "Study" };
export const dynamic = "force-dynamic";

export default async function Today() {
  const { user, enrollment, track } = await requireEnrollment();
  const [p, session, exams] = await Promise.all([getProgress(user.id, user.timezone, track, enrollment), buildDailySession(user.id, track), listExams(user.id, track)]);
  const hasExamPool = track.examPool.length > 0;
  const tookCheck = exams.some((e) => e.kind === "diagnostic");
  const tookMock = exams.some((e) => e.kind === "mock" && e.submittedAt);
  const cur = currentTopic(track, p.statuses);
  const status = cur ? p.statuses.get(cur.id) : undefined;
  const gate = cur ? p.gates.get(cur.id) : undefined;
  const run = gate?.run ?? 0;
  const target = track.mastery.runTarget;
  const domain = cur ? track.domains.find((d) => d.id === cur.domain)?.title : "";

  const count = (k: string) => session.items.filter((i) => i.kind === k).length;
  const plan = [
    { label: "Warm-up", n: count("warmup") },
    { label: "Reviews due", n: count("review") },
    { label: status === "current" ? "New in this topic" : "New", n: count("learn") },
  ].filter((r) => r.n > 0);
  const minutes = Math.max(2, Math.round(session.items.length * 0.8));

  const weekAgo = addDays(p.today, -7);
  const base = [...p.trend].reverse().find((t) => t.day <= weekAgo) ?? p.trend[0];
  const delta = Math.round(p.readiness.score - (base?.score ?? 0));

  let cta: { href: string; label: string } | null = null;
  if (status === "explain-back" && cur) cta = { href: `/topics/${cur.id}/explain`, label: "Explain it back" };
  else if (status === "current" && cur && !gate?.lessonViewedAt) cta = { href: `/topics/${cur.id}`, label: "Start topic" };
  else if (session.items.length > 0) cta = { href: "/learn", label: "Continue" };

  const date = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: user.timezone }).format(new Date());

  return (
    <main id="main" className="page flex min-h-dvh flex-col pt-12">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted">{date}</span>
        <div className="flex items-center gap-3">
          {p.streak.current > 0 && (
            <span className="flex items-center gap-1.5 text-sm font-medium" title={p.streak.graceUsedToday ? "One missed day never breaks your streak" : undefined}>
              <IconFlame size={16} className="text-accent" />{p.streak.current} {p.streak.current === 1 ? "day" : "days"}
            </span>
          )}
          <Link href="/settings" aria-label="Settings" className="-mr-2.5 flex h-11 w-11 items-center justify-center text-muted"><IconSettings size={20} /></Link>
        </div>
      </div>

      {cur ? (
        <>
          <p className="eyebrow mt-14">Topic {cur.index + 1} of {track.topics.length} · {domain}</p>
          <h1 className="display mt-3 text-[44px]">{cur.title}</h1>
          {status === "coming-soon" ? (
            <p className="mt-6 text-[17px] leading-relaxed text-soft">This topic is still being written. Reviews keep what you’ve learned fresh in the meantime.</p>
          ) : (
            <div className="mt-8 flex flex-col gap-2.5">
              <RunBar run={status === "explain-back" ? target : run} target={target} />
              <div className="flex justify-between text-sm text-muted">
                <span><b className="font-semibold text-fg">{status === "explain-back" ? target : run}</b> in a row</span>
                <span>{status === "explain-back" ? "One step left" : `${target - run} more to master`}</span>
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          <p className="eyebrow mt-14">All {track.topics.length} topics mastered</p>
          <h1 className="display mt-3 text-[44px]">Keep it fresh.</h1>
        </>
      )}

      {cta ? (
        <Link href={cta.href} className="mt-10 flex h-[60px] items-center justify-between rounded-2xl bg-ink px-6 text-[17px] font-semibold text-on-ink hover:opacity-90">
          {cta.label}
          <span className="flex items-center gap-2 text-sm font-normal opacity-70">{cta.href === "/learn" ? `~${minutes} min` : ""}<IconArrow size={18} /></span>
        </Link>
      ) : (
        <p className="mt-10 text-[17px] text-soft">You’re all caught up for today.</p>
      )}

      {plan.length > 0 && cta?.href === "/learn" && (
        <ul className="mt-9 border-t border-border">
          {plan.map((r) => (
            <li key={r.label} className="row"><span>{r.label}</span><span className="text-muted">{r.n} {r.n === 1 ? "question" : "questions"}</span></li>
          ))}
        </ul>
      )}

      {hasExamPool && !tookCheck && p.masteredCount === 0 && (
        <Link href="/exams" className="mt-9 flex items-center justify-between gap-4 rounded-2xl border border-border bg-surface p-4 hover:border-muted">
          <span>
            <span className="block text-[15px] font-semibold">Not sure where you stand?</span>
            <span className="mt-0.5 block text-[14px] text-muted">A 20-minute pre-course check maps your strong and weak areas.</span>
          </span>
          <IconArrow size={18} className="shrink-0 text-muted" />
        </Link>
      )}
      {hasExamPool && !tookMock && p.masteredCount >= Math.ceil(track.topics.length / 2) && (
        <Link href="/exams" className="mt-9 flex items-center justify-between gap-4 rounded-2xl border border-border bg-surface p-4 hover:border-muted">
          <span>
            <span className="block text-[15px] font-semibold">Ready for a dress rehearsal?</span>
            <span className="mt-0.5 block text-[14px] text-muted">A timed mock exam shows how you’d do on the day.</span>
          </span>
          <IconArrow size={18} className="shrink-0 text-muted" />
        </Link>
      )}

      <Link href="/dashboard" className="mt-auto flex items-baseline justify-between pb-6 pt-10">
        <span className="text-[15px]">Readiness</span>
        <span className="flex items-baseline gap-2">
          <span className="font-serif text-[28px]">{Math.round(p.readiness.score)}%</span>
          {delta > 0 && <span className="text-[13px] text-accent">+{delta} this week</span>}
        </span>
      </Link>
      <TabBar active="study" />
    </main>
  );
}
