import Link from "next/link";
import { requireEnrollment } from "@/lib/session";
import { DIAGNOSTIC_PER_DOMAIN, listExams, mockSize } from "@/lib/services/exams";
import { startExam } from "@/app/actions";
import { TabBar } from "@/components/TabBar";
import { IconArrow } from "@/components/Icons";
import { passPhrase } from "@/lib/engine/exam-copy";

export const metadata = { title: "Exams" };
export const dynamic = "force-dynamic";

const fmtDate = (d: Date, tz: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: tz }).format(d);

export default async function Exams() {
  const { user, track } = await requireEnrollment();
  const exams = await listExams(user.id, track);
  const done = exams.filter((e) => e.submittedAt);
  const openDiag = exams.find((e) => e.kind === "diagnostic" && !e.submittedAt);
  const openMock = exams.find((e) => e.kind === "mock" && !e.submittedAt);
  const lastDiag = done.find((e) => e.kind === "diagnostic");
  const lastMock = done.find((e) => e.kind === "mock");
  const mock = mockSize(track);
  const diagCount = Math.min(track.domains.length * DIAGNOSTIC_PER_DOMAIN, track.examPool.length);
  // Questions this learner hasn't been shown in any exam yet.
  const seen = new Set(exams.flatMap((e) => e.questionIds));
  const fresh = track.examPool.filter((q) => !seen.has(q.id)).length;
  const exam = track.exam;

  return (
    <main id="main" className="page pt-14">
      <h1 className="display text-[40px]">Exams</h1>
      <p className="mt-1.5 text-[15px] leading-relaxed text-muted">
        Practise under real conditions. These questions never appear in daily practice, so your score reflects what you know.
      </p>

      {lastMock?.estimate && (
        <Link href={`/exams/${lastMock.id}/results`} className="mt-8 block border-y border-border py-5 hover:opacity-80">
          <span className="eyebrow">If you sat the exam today</span>
          <span className="mt-2 flex items-baseline justify-between gap-3">
            <span className="font-serif text-[34px] leading-none">{lastMock.estimate.low}–{lastMock.estimate.high}%</span>
            <span className="text-right text-[14px] text-soft">{passPhrase(lastMock.estimate.passProbability)}</span>
          </span>
          <span className="mt-2 block text-[13px] text-muted">From your latest mock on {fmtDate(lastMock.submittedAt!, user.timezone)}</span>
        </Link>
      )}

      <section aria-labelledby="diag" className="mt-8 rounded-2xl border border-border bg-surface p-5">
        <p className="eyebrow">Pre-course check</p>
        <h2 id="diag" className="mt-2 font-serif text-[26px] leading-tight">Find your starting point</h2>
        <p className="mt-2 text-[15px] leading-relaxed text-soft">
          {diagCount} questions across every domain, untimed, about 20 minutes. It shows where you’re already strong and where to slow down. It doesn’t skip anything.
        </p>
        {lastDiag && (
          <Link href={`/exams/${lastDiag.id}/results`} className="row mt-3 border-t hover:opacity-80">
            <span>Your starting map · {fmtDate(lastDiag.submittedAt!, user.timezone)}</span>
            <span className="flex items-center gap-1.5 text-muted">{Math.round(lastDiag.scorePercent ?? 0)}%<IconArrow size={16} /></span>
          </Link>
        )}
        <form action={startExam} className="mt-4">
          <input type="hidden" name="kind" value="diagnostic" />
          <button className={lastDiag && !openDiag ? "btn-ghost w-full" : "btn-primary w-full"}>
            {openDiag ? "Resume check" : lastDiag ? "Retake the check" : "Start the check"}
          </button>
        </form>
      </section>

      <section aria-labelledby="mock" className="mt-4 rounded-2xl border border-border bg-surface p-5">
        <p className="eyebrow">Mock exam</p>
        <h2 id="mock" className="mt-2 font-serif text-[26px] leading-tight">The full dress rehearsal</h2>
        <p className="mt-2 text-[15px] leading-relaxed text-soft">
          {mock.questions} questions in {mock.minutes} minutes, split by domain weight like the real exam. No feedback until you submit. Flag questions and come back to them.
        </p>
        {mock.questions < (exam?.questions ?? 60) && (
          <p className="mt-2 text-[13px] text-gentle">The exam question bank is still growing, so this mock is shorter than the real {exam?.questions ?? 60}.</p>
        )}
        <form action={startExam} className="mt-4">
          <input type="hidden" name="kind" value="mock" />
          <button className="btn-primary w-full">{openMock ? "Resume mock" : lastMock ? "Start another mock" : "Start a mock exam"}</button>
        </form>
        {done.length > 0 && fresh < mock.questions && (
          <p className="mt-3 text-[13px] text-muted">You’ve seen most of the exam questions now, so mock scores may run a little high.</p>
        )}
      </section>

      {done.length > 0 && (
        <section aria-labelledby="hist" className="mt-10">
          <h2 id="hist" className="eyebrow mb-2">History</h2>
          <ul className="m-0 list-none border-t border-border p-0">
            {done.map((e) => (
              <li key={e.id}>
                <Link href={`/exams/${e.id}/results`} className="row gap-3 hover:opacity-80">
                  <span className="min-w-0">
                    {e.kind === "mock" ? "Mock exam" : "Pre-course check"}
                    <span className="block text-[13px] text-muted">{fmtDate(e.submittedAt!, user.timezone)} · {e.total} questions</span>
                  </span>
                  <span className="shrink-0 text-right">
                    <b className="font-semibold">{Math.round(e.scorePercent ?? 0)}%</b>
                    {e.kind === "mock" && <span className={`block text-[13px] ${e.passed ? "text-accent" : "text-muted"}`}>{e.passed ? "Above pass mark" : "Below pass mark"}</span>}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {exam && (
        <p className="mt-8 pb-4 text-[13px] leading-relaxed text-muted">
          Format: {exam.questions} questions, {exam.minutes} minutes, {exam.passPercent}% to pass.{" "}
          {exam.verified ? "" : "These details aren’t confirmed yet. Check the official exam page before booking."}
        </p>
      )}
      <TabBar active="exams" />
    </main>
  );
}
