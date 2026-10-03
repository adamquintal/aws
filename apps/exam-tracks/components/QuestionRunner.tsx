"use client";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import type { Feedback, SessionPayload } from "@/lib/services/learning";
import { reportProblem, startSession, submitAnswer } from "@/app/actions";
import { Code } from "./Code";
import { InlineCode } from "./InlineCode";

const KIND_LABEL = { warmup: "Warm-up", review: "Review", learn: "New material" } as const;

export function QuestionRunner({ initial }: { initial: SessionPayload }) {
  const [session, setSession] = useState(initial);
  const [i, setI] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [hintShown, setHintShown] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [tally, setTally] = useState({ right: 0, total: 0 });
  const [run, setRun] = useState(initial.run);
  const [gateReached, setGateReached] = useState(false);
  const [pending, startTransition] = useTransition();
  const startedAt = useRef(Date.now());
  const headingRef = useRef<HTMLHeadingElement>(null);
  const feedbackRef = useRef<HTMLDivElement>(null);

  const item = session.items[i];
  useEffect(() => {
    startedAt.current = Date.now();
    headingRef.current?.focus();
  }, [i, session]);
  useEffect(() => {
    if (feedback) feedbackRef.current?.focus();
  }, [feedback]);

  if (!item) {
    return <Summary tally={tally} gateReached={gateReached} topicId={session.currentTopic?.id} onAgain={() => startTransition(async () => {
      const next = await startSession();
      setSession(next); setI(0); setTally({ right: 0, total: 0 }); setRun(next.run);
    })} pending={pending} hasCurrent={!!session.currentTopic && session.currentTopic.status === "current"} />;
  }

  const q = item.question;
  const multi = q.type === "multi";

  function toggle(id: string) {
    if (feedback) return;
    if (multi) setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
    else submit([id]);
  }

  function submit(sel: string[]) {
    if (!sel.length || pending) return;
    setSelected(sel);
    startTransition(async () => {
      const fb = await submitAnswer({ questionId: q.id, selected: sel, hintUsed: hintShown, durationMs: Date.now() - startedAt.current, kind: item.kind });
      setFeedback(fb);
      setTally((t) => ({ right: t.right + (fb.correct ? 1 : 0), total: t.total + 1 }));
      if (fb.gate) {
        setRun(fb.gate.run);
        if (fb.gate.event === "gate-reached") setGateReached(true);
      }
    });
  }

  function next() {
    setFeedback(null);
    setSelected([]);
    setHintShown(false);
    // Once the gate is reached there's nothing more to prove in this topic today.
    if (gateReached) {
      const rest = session.items.slice(i + 1).filter((x) => x.topicId !== session.currentTopic?.id);
      setSession({ ...session, items: [...session.items.slice(0, i + 1), ...rest] });
    }
    setI(i + 1);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div className="flex items-center justify-between text-sm text-muted">
        <span>{KIND_LABEL[item.kind]} · {q.topicTitle}</span>
        <span aria-label={`Question ${i + 1} of ${session.items.length}`}>{i + 1} / {session.items.length}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-border" aria-hidden>
        <div className="h-full bg-accent transition-all" style={{ width: `${(i / session.items.length) * 100}%` }} />
      </div>
      {item.kind === "learn" && session.currentTopic && (
        <p className="text-sm text-muted" aria-live="polite">
          {run} of {session.runTarget} in a row on this topic
        </p>
      )}

      <div className="card space-y-4">
        <h1 ref={headingRef} tabIndex={-1} className="text-lg font-medium leading-snug outline-none"><InlineCode text={q.stem} /></h1>
        {q.code && <Code code={q.code} lang={q.codeLang} />}
        {multi && <p className="text-sm text-muted">Select all that apply.</p>}

        <fieldset className="space-y-2" disabled={!!feedback || pending}>
          <legend className="sr-only">Answer options</legend>
          {q.options.map((o, idx) => {
            const isSel = selected.includes(o.id);
            const isRight = feedback?.correctIds.includes(o.id);
            const state = !feedback ? (isSel ? "border-accent bg-bg" : "") : isRight ? "border-good" : isSel ? "border-gentle" : "opacity-80";
            return (
              <div key={o.id}>
                <button
                  type="button"
                  role={multi ? "checkbox" : undefined}
                  aria-checked={multi ? isSel : undefined}
                  aria-pressed={!multi ? isSel : undefined}
                  onClick={() => toggle(o.id)}
                  className={`w-full rounded-xl border border-border bg-surface p-3 text-left transition-colors hover:border-accent ${state}`}
                >
                  <span className="mr-2 font-mono text-muted">{String.fromCharCode(65 + idx)}.</span>
                  <span className="whitespace-pre-wrap"><InlineCode text={o.text} /></span>
                  {feedback && isRight && <span className="ml-2 text-sm text-good">✓ correct</span>}
                </button>
                {feedback && (
                  <p className={`mt-1 px-3 text-sm ${isRight ? "text-good" : "text-muted"}`}><InlineCode text={feedback.notes[o.id]} /></p>
                )}
              </div>
            );
          })}
        </fieldset>

        {!feedback && (
          <div className="flex flex-wrap gap-3">
            {multi && <button className="btn-primary" onClick={() => submit(selected)} disabled={!selected.length || pending}>Check answer</button>}
            {!hintShown ? (
              <button className="btn-ghost" onClick={() => setHintShown(true)}>I'm stuck</button>
            ) : (
              <p className="w-full rounded-xl bg-bg p-3 text-sm" role="note"><strong>Hint:</strong> <InlineCode text={q.hint} />
                <span className="block text-muted">(Answers with a hint still count for reviews, just not for the in-a-row run.)</span></p>
            )}
          </div>
        )}
      </div>

      {feedback && (
        <div ref={feedbackRef} tabIndex={-1} className="card space-y-3 outline-none" aria-live="polite">
          <p className={`text-lg font-semibold ${feedback.correct ? "text-good" : "text-gentle"}`}>
            {feedback.correct ? "Right." : "Not quite."}
          </p>
          <p><InlineCode text={feedback.explanation} /></p>
          {feedback.gate?.event === "reset" && (
            <p className="text-sm text-muted">The in-a-row count starts again. That's how the practice works, and this one will come back so you can lock it in.</p>
          )}
          {feedback.gate?.event === "gate-reached" && (
            <p className="rounded-xl bg-bg p-3">🌱 {session.runTarget} in a row. Nicely done. One small step left: explain this topic in your own words.</p>
          )}
          <p className="text-xs text-muted">
            Source:{" "}
            {feedback.sources.map((s, k) => (
              <span key={s.url}>{k > 0 && " · "}<a className="underline" href={s.url} target="_blank" rel="noreferrer">{s.title}</a></span>
            ))}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            {feedback.gate?.event === "gate-reached" ? (
              <Link href={`/topics/${feedback.gate.topicId}/explain`} className="btn-primary">Explain it back</Link>
            ) : (
              <button className="btn-primary" onClick={next} autoFocus>Next</button>
            )}
            {feedback.gate?.event === "gate-reached" && <button className="btn-ghost" onClick={next}>Finish the session first</button>}
            <ReportProblem questionId={q.id} version={q.version} />
          </div>
        </div>
      )}
      {!feedback && <ReportProblem questionId={q.id} version={q.version} />}
    </div>
  );
}

function Summary(props: { tally: { right: number; total: number }; gateReached: boolean; topicId?: string; onAgain: () => void; pending: boolean; hasCurrent: boolean }) {
  const { tally } = props;
  return (
    <div className="mx-auto max-w-lg space-y-5 text-center">
      <h1 className="text-2xl font-semibold">Session done.</h1>
      {tally.total > 0 ? (
        <p className="text-muted">You answered {tally.total} question{tally.total === 1 ? "" : "s"} and got {tally.right} right. Every one of them strengthens your memory, the misses included.</p>
      ) : (
        <p className="text-muted">Nothing is due right now. You're all caught up.</p>
      )}
      <div className="flex flex-wrap justify-center gap-3">
        {props.gateReached && props.topicId ? (
          <Link href={`/topics/${props.topicId}/explain`} className="btn-primary">Explain it back</Link>
        ) : (
          props.hasCurrent && <button className="btn-primary" onClick={props.onAgain} disabled={props.pending}>Another round</button>
        )}
        <Link href="/dashboard" className="btn-ghost">See your progress</Link>
      </div>
    </div>
  );
}

function ReportProblem({ questionId, version }: { questionId: string; version: number }) {
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState(false);
  const [pending, start] = useTransition();
  if (sent) return <span className="text-sm text-muted" role="status">Thanks, a reviewer will look at it.</span>;
  if (!open) return <button className="text-sm text-muted underline" onClick={() => setOpen(true)}>Report a problem with this question</button>;
  return (
    <form
      className="card w-full space-y-2 text-left"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        start(async () => {
          await reportProblem({ questionId, questionVersion: version, reason: fd.get("reason") as "other", message: String(fd.get("message") ?? "") || undefined });
          setSent(true);
        });
      }}
    >
      <label className="label" htmlFor={`reason-${questionId}`}>What's wrong?</label>
      <select id={`reason-${questionId}`} name="reason" className="input">
        <option value="wrong_answer">The marked answer looks wrong</option>
        <option value="unclear">The question is unclear</option>
        <option value="outdated">Outdated for current Prometheus</option>
        <option value="typo">Typo or formatting</option>
        <option value="other">Something else</option>
      </select>
      <label className="label" htmlFor={`msg-${questionId}`}>Details (optional)</label>
      <textarea id={`msg-${questionId}`} name="message" className="input min-h-20" maxLength={2000} />
      <div className="flex gap-2">
        <button className="btn-primary" disabled={pending}>Send</button>
        <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </form>
  );
}
