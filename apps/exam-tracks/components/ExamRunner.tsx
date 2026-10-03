"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import type { PublicExamQuestion } from "@/lib/services/exams";
import type { Confidence, ExamAnswers } from "@/lib/engine/exam";
import { saveExamProgress, submitExam } from "@/app/actions";
import { Code } from "./Code";
import { InlineCode } from "./InlineCode";
import { IconBack, IconCheck, IconClose, IconFlag, IconGrid } from "./Icons";

const CONFIDENCE: { id: Confidence; label: string }[] = [
  { id: "sure", label: "Sure" },
  { id: "think", label: "Think so" },
  { id: "guess", label: "Guess" },
];

type Props = {
  attemptId: string;
  kind: "diagnostic" | "mock";
  questions: PublicExamQuestion[];
  initialAnswers: ExamAnswers;
  deadlineMs: number | null;
  serverNowMs: number;
};

export function ExamRunner({ attemptId, kind, questions, initialAnswers, deadlineMs, serverNowMs }: Props) {
  const router = useRouter();
  const [answers, setAnswers] = useState<ExamAnswers>(initialAnswers);
  const [i, setI] = useState(() => {
    const firstOpen = questions.findIndex((q) => !initialAnswers[q.id]?.selected.length);
    return firstOpen === -1 ? 0 : firstOpen;
  });
  const [view, setView] = useState<"question" | "review">("question");
  const [confirming, setConfirming] = useState(false);
  const [submitting, startSubmit] = useTransition();
  const [saveError, setSaveError] = useState(false);
  const dirty = useRef(false);
  const answersRef = useRef(answers);
  answersRef.current = answers;
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Timer, corrected for the gap between server and browser clocks.
  const skew = useRef(serverNowMs - Date.now());
  const [now, setNow] = useState(() => Date.now() + skew.current);
  useEffect(() => {
    if (!deadlineMs) return;
    const t = setInterval(() => setNow(Date.now() + skew.current), 1000);
    return () => clearInterval(t);
  }, [deadlineMs]);
  const remaining = deadlineMs ? Math.max(0, Math.floor((deadlineMs - now) / 1000)) : null;

  const save = useCallback(async () => {
    if (!dirty.current) return;
    dirty.current = false;
    try {
      const r = await saveExamProgress(attemptId, answersRef.current);
      setSaveError(!r.ok);
    } catch {
      dirty.current = true;
      setSaveError(true);
    }
  }, [attemptId]);

  // Autosave on every move, and every 20 seconds as a safety net.
  useEffect(() => { void save(); }, [i, view, save]);
  useEffect(() => {
    const t = setInterval(() => void save(), 20_000);
    return () => clearInterval(t);
  }, [save]);

  const finish = useCallback(() => {
    startSubmit(async () => {
      await submitExam(attemptId, answersRef.current);
      router.replace(`/exams/${attemptId}/results`);
    });
  }, [attemptId, router]);

  // Time's up: submit what's there.
  const autoSubmitted = useRef(false);
  useEffect(() => {
    if (remaining === 0 && !autoSubmitted.current) {
      autoSubmitted.current = true;
      finish();
    }
  }, [remaining, finish]);

  useEffect(() => {
    if (view === "question") headingRef.current?.focus();
    window.scrollTo({ top: 0 });
  }, [i, view]);

  const q = questions[i];
  const a = answers[q.id] ?? { selected: [] };
  const answeredCount = questions.filter((x) => answers[x.id]?.selected.length).length;
  const flaggedCount = questions.filter((x) => answers[x.id]?.flagged).length;
  const unanswered = questions.length - answeredCount;

  function update(id: string, patch: Partial<ExamAnswers[string]>) {
    dirty.current = true;
    setAnswers((prev) => ({ ...prev, [id]: { ...(prev[id] ?? { selected: [] }), ...patch } }));
  }
  function pick(optionId: string) {
    const sel = q.type === "multi" ? (a.selected.includes(optionId) ? a.selected.filter((x) => x !== optionId) : [...a.selected, optionId]) : [optionId];
    update(q.id, { selected: sel });
  }
  function go(n: number) {
    setView("question");
    setI(Math.max(0, Math.min(questions.length - 1, n)));
  }

  const timer = remaining == null ? (
    <span className="text-[13px] text-muted">Untimed</span>
  ) : (
    <span role="timer" aria-label={`${Math.floor(remaining / 60)} minutes left`}
      className={`font-mono text-[15px] tabular-nums ${remaining < 300 ? "font-semibold text-gentle" : "text-fg"}`}>
      {fmt(remaining)}
    </span>
  );

  const header = (
    <header className="page flex flex-col gap-3 pt-12">
      <div className="flex items-center justify-between gap-3">
        <Link href="/exams" onClick={() => void save()} aria-label="Save and leave" className="-ml-2.5 flex h-11 w-11 shrink-0 items-center justify-center"><IconClose size={20} /></Link>
        <span className="text-[13px] text-muted">{view === "review" ? "Review" : `Question ${i + 1} of ${questions.length}`}</span>
        <span className="flex w-16 justify-end">{timer}</span>
      </div>
      <div className="h-1 rounded-full bg-track" role="img" aria-label={`${answeredCount} of ${questions.length} answered`}>
        <div className="h-1 rounded-full bg-fg transition-[width]" style={{ width: `${(100 * answeredCount) / questions.length}%` }} />
      </div>
      {saveError && <p role="status" className="text-[13px] text-gentle">Couldn’t save just now. Your answers are kept on this screen and we’ll retry.</p>}
    </header>
  );

  if (view === "review") {
    return (
      <div className="flex min-h-dvh flex-col">
        {header}
        <main id="main" className="page flex flex-col gap-6 pb-40 pt-7">
          <h1 className="display text-[36px]">Check your answers</h1>
          <p className="-mt-3 text-[15px] text-soft">
            {answeredCount} answered · {unanswered} unanswered · {flaggedCount} flagged. Tap a number to go back to it.
          </p>
          <ol className="grid list-none grid-cols-6 gap-2 p-0 sm:grid-cols-10" aria-label="Questions">
            {questions.map((x, k) => {
              const ans = answers[x.id];
              const done = !!ans?.selected.length;
              return (
                <li key={x.id}>
                  <button onClick={() => go(k)}
                    aria-label={`Question ${k + 1}: ${done ? "answered" : "unanswered"}${ans?.flagged ? ", flagged" : ""}`}
                    className={`relative flex h-12 w-full items-center justify-center rounded-xl text-[15px] font-medium ${done ? "bg-ink text-on-ink" : "border border-border bg-surface text-fg"}`}>
                    {k + 1}
                    {ans?.flagged && <span aria-hidden className="absolute right-1 top-1 h-2 w-2 rounded-full bg-gentle" />}
                  </button>
                </li>
              );
            })}
          </ol>
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-[13px] text-muted">
            <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-ink" />Answered</span>
            <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded border border-border bg-surface" />Unanswered</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-gentle" />Flagged</span>
          </div>
        </main>
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 backdrop-blur">
          <div className="page flex flex-col gap-2 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3">
            {confirming ? (
              <>
                <p className="text-[15px] text-soft">
                  {unanswered > 0 ? `${unanswered} unanswered ${unanswered === 1 ? "question counts" : "questions count"} as wrong. ` : ""}
                  {flaggedCount > 0 ? `${flaggedCount} still flagged. ` : ""}You can’t change answers after submitting.
                </p>
                <div className="flex gap-2.5">
                  <button className="btn-ghost" onClick={() => setConfirming(false)} disabled={submitting}>Keep going</button>
                  <button className="btn-primary flex-1" onClick={finish} disabled={submitting}>{submitting ? "Scoring…" : "Submit"}</button>
                </div>
              </>
            ) : (
              <div className="flex gap-2.5">
                <button className="btn-ghost" onClick={() => go(i)}>Back</button>
                <button className="btn-primary flex-1" onClick={() => (unanswered || flaggedCount ? setConfirming(true) : finish())} disabled={submitting}>
                  {submitting ? "Scoring…" : kind === "mock" ? "Submit exam" : "See my results"}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  const multi = q.type === "multi";
  return (
    <div className="flex min-h-dvh flex-col">
      {header}
      <main id="main" className="page flex flex-col gap-6 pb-44 pt-7">
        <h1 ref={headingRef} tabIndex={-1} className="font-serif text-[26px] font-normal leading-[1.25] outline-none [overflow-wrap:anywhere]">
          <InlineCode text={q.stem} />
        </h1>
        {q.code && <Code code={q.code} lang={q.codeLang} />}
        {multi && <p className="-mt-2 text-[15px] font-medium text-accent">Select all that apply.</p>}

        <div role="group" aria-label="Answers" className="flex flex-col gap-2.5">
          {q.options.map((o) => {
            const on = a.selected.includes(o.id);
            const shape = multi ? "rounded-md" : "rounded-full";
            return (
              <button key={o.id} type="button" onClick={() => pick(o.id)}
                role={multi ? "checkbox" : "radio"} aria-checked={on}
                className={`flex min-h-[58px] w-full items-center gap-3.5 rounded-2xl px-4 py-3 text-left transition-colors ${on ? "border-2 border-fg bg-surface" : "border border-border bg-surface [@media(hover:hover)]:hover:border-muted"}`}>
                <span aria-hidden className={`flex h-[22px] w-[22px] shrink-0 items-center justify-center ${shape} ${on ? "border-[1.5px] border-fg bg-fg text-surface" : "border-[1.5px] border-track"}`}>
                  {on && <IconCheck size={14} />}
                </span>
                <span className="min-w-0 whitespace-pre-wrap text-[17px] leading-snug [overflow-wrap:anywhere]"><InlineCode text={o.text} /></span>
              </button>
            );
          })}
        </div>

        {a.selected.length > 0 && (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-[14px] text-muted">How sure are you?</legend>
            <div className="grid grid-cols-3 gap-2">
              {CONFIDENCE.map((c) => {
                const on = a.confidence === c.id;
                return (
                  <button key={c.id} type="button" aria-pressed={on} onClick={() => update(q.id, { confidence: on ? undefined : c.id })}
                    className={`h-11 rounded-xl text-[15px] ${on ? "bg-ink font-semibold text-on-ink" : "border border-border bg-surface text-fg"}`}>
                    {c.label}
                  </button>
                );
              })}
            </div>
          </fieldset>
        )}

        <button type="button" aria-pressed={!!a.flagged} onClick={() => update(q.id, { flagged: !a.flagged })}
          className={`flex items-center gap-2 self-start py-2 text-[15px] ${a.flagged ? "font-semibold text-gentle" : "text-muted"}`}>
          <IconFlag size={18} />{a.flagged ? "Flagged for review" : "Flag for review"}
        </button>
      </main>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 backdrop-blur">
        <div className="page flex gap-2.5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3">
          <button className="btn-ghost w-14 px-0" onClick={() => go(i - 1)} disabled={i === 0} aria-label="Previous question"><IconBack /></button>
          <button className="btn-ghost w-14 px-0" onClick={() => setView("review")} aria-label="All questions"><IconGrid size={20} /></button>
          {i < questions.length - 1 ? (
            <button className="btn-primary flex-1" onClick={() => go(i + 1)}>Next</button>
          ) : (
            <button className="btn-primary flex-1" onClick={() => setView("review")}>Review answers</button>
          )}
        </div>
      </div>
    </div>
  );
}

function fmt(s: number) {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return `${h ? `${h}:` : ""}${String(m).padStart(h ? 2 : 1, "0")}:${String(sec).padStart(2, "0")}`;
}
