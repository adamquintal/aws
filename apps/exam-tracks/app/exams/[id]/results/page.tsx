import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireEnrollment } from "@/lib/session";
import { getAttempt } from "@/lib/services/exams";
import { band, BAND_LABEL, CONFIDENCE_LABEL, type ExamAnswers, type ExamResult } from "@/lib/engine/exam";
import { passPhrase } from "@/lib/engine/exam-copy";
import type { LoadedExamQuestion } from "@/lib/content/load";
import { TabBar } from "@/components/TabBar";
import { Code } from "@/components/Code";
import { InlineCode } from "@/components/InlineCode";
import { ReportProblem } from "@/components/ReportProblem";
import { IconBack, IconCheck } from "@/components/Icons";

export const metadata = { title: "Results" };
export const dynamic = "force-dynamic";

const pct = (n: number, d: number) => (d ? Math.round((100 * n) / d) : 0);

export default async function Results({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, track } = await requireEnrollment();
  const found = await getAttempt(user.id, track, id);
  if (!found) notFound();
  const { attempt, questions } = found;
  if (!attempt.submittedAt || !attempt.result) redirect(`/exams/${id}`);
  const r = attempt.result as unknown as ExamResult;
  const answers = attempt.answers as ExamAnswers;
  const isMock = attempt.kind === "mock";
  const threshold = track.readiness.domainThreshold;
  const passPercent = r.estimate.passPercent;
  const date = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", timeZone: user.timezone }).format(attempt.submittedAt);
  const topicTitle = Object.fromEntries(track.topics.map((t) => [t.id, t.title]));

  const wrongSure = questions.filter((q) => r.perQuestion[q.id] && !r.perQuestion[q.id].correct && r.perQuestion[q.id].confidence === "sure");
  const wrongOther = questions.filter((q) => r.perQuestion[q.id] && !r.perQuestion[q.id].correct && r.perQuestion[q.id].confidence !== "sure");
  const right = questions.filter((q) => r.perQuestion[q.id]?.correct);
  const watchTopics = track.topics.filter((t) => r.byTopic[t.id] && r.byTopic[t.id].correct < r.byTopic[t.id].total);
  const rated = (["sure", "think", "guess"] as const).filter((c) => r.calibration[c].total > 0);

  return (
    <main id="main" className="page pt-12">
      <Link href="/exams" aria-label="Back to exams" className="-ml-2.5 flex h-11 w-11 items-center justify-center"><IconBack /></Link>

      <p className="eyebrow mt-4">{isMock ? "Mock exam" : "Pre-course check"} · {date}</p>
      {isMock ? (
        <>
          <div className="mt-2 flex items-baseline gap-3">
            <span className="font-serif text-[96px] leading-none">{Math.round(r.percent)}<span className="text-[48px]">%</span></span>
          </div>
          <p className="mt-3 text-[16px] leading-relaxed text-soft">
            {r.correct} of {r.total} right.{" "}
            {attempt.passed
              ? <span className="font-semibold text-accent">Above the {passPercent}% pass mark.</span>
              : <>Below the {passPercent}% pass mark this time. The breakdown below shows exactly where the points are.</>}
          </p>
        </>
      ) : (
        <>
          <h1 className="display mt-3 text-[44px]">Your starting map</h1>
          <p className="mt-4 text-[17px] leading-relaxed text-soft">
            {r.correct} of {r.total} right. Every topic still opens in order. This just shows where you’ll move quickly and where to slow down.
          </p>
        </>
      )}

      {isMock && (
        <section aria-labelledby="est" className="mt-8 border-y border-border py-5">
          <h2 id="est" className="eyebrow">If you sat the exam today</h2>
          <div className="mt-2 flex items-baseline justify-between gap-3">
            <span className="font-serif text-[40px] leading-none">{r.estimate.low}–{r.estimate.high}%</span>
            <span className="text-right text-[15px] font-medium">{passPhrase(r.estimate.passProbability)}</span>
          </div>
          <p className="mt-3 text-[13px] leading-relaxed text-muted">
            Likely score range, with about a {Math.round(r.estimate.passProbability * 100)}% chance of reaching {passPercent}%. It comes from these {r.estimate.basedOn} answers, weighted by domain. Correct guesses count half. It’s an estimate, not a promise, and it tightens as you take more mocks.
          </p>
        </section>
      )}

      <section aria-labelledby="dom" className="mt-9 flex flex-col gap-5">
        <div className="flex items-baseline justify-between">
          <h2 id="dom" className="eyebrow">By exam domain</h2>
          {isMock && <span className="text-xs text-muted">line = {Math.round(threshold * 100)}% target</span>}
        </div>
        {track.domains.map((d) => {
          const t = r.byDomain[d.id];
          if (!t) return null;
          const b = band(t.correct, t.total);
          return (
            <div key={d.id} className="flex flex-col gap-2">
              <div className="flex justify-between gap-3 text-[15px]">
                <span>{d.title} <span className="text-muted">{d.weight}%</span></span>
                <span className="shrink-0 font-semibold">{t.correct}/{t.total}</span>
              </div>
              <div className="relative h-2 rounded-full bg-track" role="img" aria-label={`${d.title}: ${t.correct} of ${t.total} right`}>
                <div className={`h-2 rounded-full ${b === "focus" ? "bg-gentle" : "bg-accent"}`} style={{ width: `${pct(t.correct, t.total)}%` }} />
                {isMock && <div className="absolute -top-1 h-4 w-0.5 bg-fg" style={{ left: `${threshold * 100}%` }} />}
              </div>
              {!isMock && <span className={`text-[13px] ${b === "focus" ? "font-medium text-gentle" : "text-muted"}`}>{BAND_LABEL[b]}</span>}
            </div>
          );
        })}
      </section>

      {!isMock && watchTopics.length > 0 && (
        <section aria-labelledby="watch" className="mt-10">
          <h2 id="watch" className="eyebrow mb-2">Topics to take slowly</h2>
          <ul className="m-0 list-none border-t border-border p-0">
            {watchTopics.map((t) => (
              <li key={t.id} className="row gap-3">
                <span className="min-w-0">{t.index + 1}. {t.title}</span>
                <span className="shrink-0 text-[13px] text-muted">{r.byTopic[t.id].correct}/{r.byTopic[t.id].total}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[13px] text-muted">These are marked on your path, so you’ll know when you reach them.</p>
        </section>
      )}

      {rated.length > 0 && (
        <section aria-labelledby="conf" className="mt-10">
          <h2 id="conf" className="eyebrow mb-2">How well your confidence matched</h2>
          <ul className="m-0 list-none border-t border-border p-0">
            {rated.map((c) => (
              <li key={c} className="row">
                <span>{CONFIDENCE_LABEL[c]} <span className="text-muted">· {r.calibration[c].total}</span></span>
                <span><b className="font-semibold">{pct(r.calibration[c].correct, r.calibration[c].total)}%</b> <span className="text-muted">right</span></span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[14px] leading-relaxed text-soft">{calibrationNote(r)}</p>
        </section>
      )}

      <section aria-labelledby="rev" className="mt-10 flex flex-col gap-6 pb-10">
        <h2 id="rev" className="eyebrow">Review the questions</h2>
        {wrongSure.length > 0 && <Group title={`Felt sure, but missed (${wrongSure.length})`} note="Review these first. A confident wrong answer is the kind that costs points on the day." qs={wrongSure} answers={answers} topicTitle={topicTitle} open />}
        {wrongOther.length > 0 && <Group title={`Other misses (${wrongOther.length})`} qs={wrongOther} answers={answers} topicTitle={topicTitle} />}
        {right.length > 0 && <Group title={`Right (${right.length})`} qs={right} answers={answers} topicTitle={topicTitle} />}
      </section>

      {!isMock && (
        <Link href="/today" className="btn-primary mb-8 w-full">Start learning</Link>
      )}
      <TabBar active="exams" />
    </main>
  );
}

function calibrationNote(r: ExamResult): string {
  const s = r.calibration.sure, g = r.calibration.guess;
  if (s.total >= 3 && s.correct / s.total < 0.85)
    return `When you felt sure you were right ${pct(s.correct, s.total)}% of the time. Some of what feels familiar needs a second look.`;
  if (g.total >= 3 && g.correct / g.total > 0.6)
    return `Your guesses were right ${pct(g.correct, g.total)}% of the time. You know more than you think. Trust your first instinct a bit more.`;
  if (s.total >= 3) return "When you felt sure you were almost always right. Your sense of what you know is well tuned.";
  return "Rating how sure you are on each answer helps show which knowledge is solid and which is luck.";
}

function Group({ title, note, qs, answers, topicTitle, open = false }: {
  title: string; note?: string; qs: LoadedExamQuestion[]; answers: ExamAnswers; topicTitle: Record<string, string>; open?: boolean;
}) {
  return (
    <details open={open} className="group">
      <summary className="flex cursor-pointer list-none items-center justify-between border-b border-border py-3 text-[16px] font-semibold">
        {title}<span aria-hidden className="text-muted transition-transform group-open:rotate-90">›</span>
      </summary>
      {note && <p className="mt-3 text-[14px] text-soft">{note}</p>}
      <ol className="m-0 mt-2 flex list-none flex-col p-0">
        {qs.map((q) => <ReviewItem key={q.id} q={q} answer={answers[q.id]} topic={topicTitle[q.topic]} />)}
      </ol>
    </details>
  );
}

function ReviewItem({ q, answer, topic }: { q: LoadedExamQuestion; answer?: ExamAnswers[string]; topic: string }) {
  const sel = answer?.selected ?? [];
  return (
    <li className="border-b border-border py-5">
      <p className="text-[13px] text-muted">{topic}{answer?.confidence ? ` · you said “${CONFIDENCE_LABEL[answer.confidence]}”` : ""}{!sel.length ? " · not answered" : ""}</p>
      <p className="mt-1.5 font-serif text-[21px] leading-snug"><InlineCode text={q.stem} /></p>
      {q.code && <div className="mt-3"><Code code={q.code} lang={q.codeLang} /></div>}
      <ul className="m-0 mt-3 flex list-none flex-col gap-2 p-0">
        {q.options.map((o) => {
          const picked = sel.includes(o.id);
          const tone = o.correct ? "border-accent bg-accent/10" : picked ? "border-gentle bg-trap" : "border-border";
          return (
            <li key={o.id} className={`rounded-xl border px-3.5 py-2.5 ${tone}`}>
              <div className="flex items-start gap-2.5 text-[15px]">
                <span aria-hidden className={`mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full text-[12px] ${o.correct ? "bg-accent text-surface" : picked ? "bg-gentle text-surface" : "border border-track"}`}>
                  {o.correct ? <IconCheck size={12} /> : picked ? "×" : null}
                </span>
                <span className="min-w-0 [overflow-wrap:anywhere]">
                  <InlineCode text={o.text} />
                  {(picked || o.correct) && <span className="sr-only">{o.correct ? " (correct answer)" : ""}{picked ? " (your answer)" : ""}</span>}
                </span>
              </div>
              {(o.correct || picked) && o.note !== "This is the correct answer." && <p className="ml-7 mt-1 text-[13px] leading-snug text-muted [overflow-wrap:anywhere]"><InlineCode text={o.note} /></p>}
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-[15px] leading-relaxed text-soft [overflow-wrap:anywhere]"><InlineCode text={q.explanation} /></p>
      <p className="mt-2 text-[13px] text-muted">
        Source:{" "}
        {q.sources.map((s, k) => (
          <span key={s.url}>{k > 0 && " · "}<a className="link" href={s.url} target="_blank" rel="noreferrer">{s.title}</a></span>
        ))}
      </p>
      <div className="mt-2"><ReportProblem questionId={q.id} version={q.version} /></div>
    </li>
  );
}
