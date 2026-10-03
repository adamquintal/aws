"use client";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import type { Feedback, SessionPayload } from "@/lib/services/learning";
import { reportProblem, startSession, submitAnswer } from "@/app/actions";
import { Code } from "./Code";
import { InlineCode } from "./InlineCode";
import { FocusHeader } from "./FocusHeader";
import { IconCheck } from "./Icons";

const KIND_LABEL = { warmup: "Warm-up", review: "Review", learn: "New" } as const;

export function QuestionRunner({ initial }: { initial: SessionPayload }) {
  const [session, setSession] = useState(initial);
  const [i, setI] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [hintShown, setHintShown] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [results, setResults] = useState<boolean[]>([]);
  const [run, setRun] = useState(initial.run);
  const [gateReached, setGateReached] = useState(false);
  const [pending, startTransition] = useTransition();
  const startedAt = useRef(Date.now());
  const headingRef = useRef<HTMLHeadingElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);

  const item = session.items[i];
  useEffect(() => {
    startedAt.current = Date.now();
    headingRef.current?.focus();
    window.scrollTo({ top: 0 });
  }, [i, session]);
  useEffect(() => {
    if (feedback) sheetRef.current?.focus();
  }, [feedback]);

  if (!item) {
    const right = results.filter(Boolean).length;
    return (
      <Summary
        total={results.length}
        right={right}
        gateReached={gateReached}
        topicId={session.currentTopic?.id}
        hasCurrent={!!session.currentTopic && session.currentTopic.status === "current"}
        pending={pending}
        onAgain={() =>
          startTransition(async () => {
            const next = await startSession();
            setSession(next); setI(0); setResults([]); setRun(next.run);
          })
        }
      />
    );
  }

  const q = item.question;
  const multi = q.type === "multi";
  const isLearn = item.kind === "learn" && !!session.currentTopic;

  function toggle(id: string) {
    if (feedback || pending) return;
    if (multi) setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
    else submit([id]);
  }

  function submit(sel: string[]) {
    if (!sel.length || pending) return;
    setSelected(sel);
    startTransition(async () => {
      const fb = await submitAnswer({ questionId: q.id, selected: sel, hintUsed: hintShown, durationMs: Date.now() - startedAt.current, kind: item.kind });
      setFeedback(fb);
      setResults((r) => [...r, fb.correct]);
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

  const runLabel = feedback?.gate?.event === "reset" ? "Run starts again" : `${run} in a row`;

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="page flex flex-col gap-4 pt-12">
        <div className="flex items-center gap-3">
          <FocusHeader href="/today" close />
          <div className="grid flex-1 gap-1" style={{ gridTemplateColumns: `repeat(${session.items.length}, minmax(0, 1fr))` }} role="img" aria-label={`Question ${i + 1} of ${session.items.length}`}>
            {session.items.map((_, k) => (
              <div key={k} className={`h-[5px] rounded-full ${k < results.length ? (results[k] ? "bg-accent" : "bg-gentle") : k === i ? "bg-muted" : "bg-track"}`} />
            ))}
          </div>
        </div>
        <div className="flex justify-between gap-4 text-[13px] text-muted">
          <span className="min-w-0 truncate">{KIND_LABEL[item.kind]} · {q.topicTitle}</span>
          {isLearn && <span aria-live="polite" className="shrink-0 whitespace-nowrap">{runLabel}</span>}
        </div>
      </header>

      <main id="main" className={`page flex flex-col gap-6 pt-7 ${feedback ? "pb-[22rem]" : "pb-10"}`}>
        <h1 ref={headingRef} tabIndex={-1} className="font-serif text-[28px] font-normal leading-[1.22] outline-none [overflow-wrap:anywhere]">
          <InlineCode text={q.stem} />
        </h1>
        {q.code && <Code code={q.code} lang={q.codeLang} />}
        {multi && !feedback && <p className="-mt-2 text-[15px] font-medium text-accent">Select all that apply, then check.</p>}

        <div role="group" aria-label="Answers" className="flex flex-col gap-2.5">
          {q.options.map((o) => {
            const isSel = selected.includes(o.id);
            const isRight = !!feedback?.correctIds.includes(o.id);
            const wrongPick = !!feedback && isSel && !isRight;
            const box = !feedback
              ? isSel ? "border-2 border-accent bg-accent/10" : "border border-border bg-surface [@media(hover:hover)]:hover:border-muted"
              : isRight ? "border-2 border-accent bg-accent/10" : wrongPick ? "border-2 border-gentle bg-trap" : "border border-border bg-surface opacity-60";
            const markShape = multi ? "rounded-md" : "rounded-full";
            const mark = !feedback
              ? isSel ? `${markShape} border-[1.5px] border-accent bg-accent text-surface` : `${markShape} border-[1.5px] border-track`
              : isRight ? `${markShape} border-[1.5px] border-accent bg-accent text-surface` : wrongPick ? `${markShape} border-[1.5px] border-gentle bg-gentle text-surface` : `${markShape} border-[1.5px] border-track`;
            return (
              <div key={o.id} className="flex flex-col gap-1.5">
                <button
                  type="button"
                  role={multi ? "checkbox" : undefined}
                  aria-checked={multi ? isSel : undefined}
                  aria-pressed={!multi ? isSel : undefined}
                  onClick={() => toggle(o.id)}
                  disabled={!!feedback || pending}
                  className={`flex min-h-[58px] w-full items-center gap-3.5 rounded-2xl px-4 py-3 text-left transition-colors disabled:cursor-default ${box}`}
                >
                  <span aria-hidden className={`flex h-[22px] w-[22px] shrink-0 items-center justify-center text-sm ${mark}`}>
                    {(isSel && !feedback) || isRight ? <IconCheck size={14} /> : wrongPick ? "×" : null}
                  </span>
                  <span className="min-w-0 whitespace-pre-wrap text-[17px] leading-snug [overflow-wrap:anywhere]"><InlineCode text={o.text} /></span>
                </button>
                {feedback && (
                  <p className={`px-1 text-[14px] leading-snug [overflow-wrap:anywhere] ${isRight ? "text-accent" : "text-muted"}`}><InlineCode text={feedback.notes[o.id]} /></p>
                )}
              </div>
            );
          })}
        </div>

        {!feedback && (
          <div className="flex flex-col gap-4">
            {multi && (
              <button className="btn-primary w-full" onClick={() => submit(selected)} disabled={!selected.length || pending}>
                Check answer{selected.length ? ` · ${selected.length} selected` : ""}
              </button>
            )}
            {!hintShown ? (
              <button className="self-start py-2 text-[15px] text-muted underline underline-offset-4" onClick={() => setHintShown(true)}>I’m stuck</button>
            ) : (
              <p role="note" className="text-[15px] leading-relaxed text-soft">
                <span className="font-semibold text-fg">Hint.</span> <InlineCode text={q.hint} />
                <span className="mt-1 block text-[13px] text-muted">Answers after a hint still count for reviews, just not for the in-a-row run.</span>
              </p>
            )}
            <ReportProblem questionId={q.id} version={q.version} />
          </div>
        )}
      </main>

      {feedback && (
        <div className="fixed inset-x-0 bottom-0 z-30">
          <div ref={sheetRef} tabIndex={-1} aria-live="polite" className="sheet mx-auto max-w-xl rounded-t-3xl bg-surface px-6 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-6 shadow-[0_-8px_30px_rgba(22,24,29,0.10)] outline-none">
            <div className="flex items-baseline justify-between gap-4">
              <p className={`font-serif text-[32px] leading-none ${feedback.correct ? "text-accent" : "text-gentle"}`}>{feedback.correct ? "Right." : "Not quite."}</p>
              <ReportProblem questionId={q.id} version={q.version} compact />
            </div>
            <p className="mt-3 max-h-40 overflow-y-auto text-[16px] leading-relaxed text-soft [overflow-wrap:anywhere]"><InlineCode text={feedback.explanation} /></p>
            {feedback.gate?.event === "reset" && <p className="mt-2 text-[14px] text-muted">The run starts again. This one will come back so you can lock it in.</p>}
            {feedback.gate?.event === "gate-reached" && <p className="mt-2 text-[15px] font-medium text-fg">{session.runTarget} in a row. One small step left: explain it in your own words.</p>}
            <p className="mt-3 text-[13px] text-muted">
              Source:{" "}
              {feedback.sources.map((s, k) => (
                <span key={s.url}>{k > 0 && " · "}<a className="link" href={s.url} target="_blank" rel="noreferrer">{s.title}</a></span>
              ))}
            </p>
            <div className="mt-5 flex gap-2.5">
              {feedback.gate?.event === "gate-reached" ? (
                <>
                  <button className="btn-ghost" onClick={next}>Later</button>
                  <Link href={`/topics/${feedback.gate.topicId}/explain`} className="btn-primary flex-1">Explain it back</Link>
                </>
              ) : (
                <button className="btn-primary w-full" onClick={next} autoFocus>Continue</button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Summary(props: { total: number; right: number; gateReached: boolean; topicId?: string; onAgain: () => void; pending: boolean; hasCurrent: boolean }) {
  const { total, right } = props;
  return (
    <main id="main" className="page flex min-h-dvh flex-col justify-center pb-16">
      <p className="eyebrow">Session done</p>
      <h1 className="display mt-3 text-[44px]">{total > 0 ? `${right} of ${total} right.` : "All caught up."}</h1>
      <p className="mt-5 text-[17px] leading-relaxed text-soft">
        {total > 0 ? "Every answer strengthens your memory, the misses included. They come back at the right time." : "Nothing is due right now."}
      </p>
      <div className="mt-10 flex flex-col gap-3">
        {props.gateReached && props.topicId ? (
          <Link href={`/topics/${props.topicId}/explain`} className="btn-primary">Explain it back</Link>
        ) : (
          props.hasCurrent && <button className="btn-primary" onClick={props.onAgain} disabled={props.pending}>Another round</button>
        )}
        <Link href="/today" className="btn-ghost">Done for now</Link>
      </div>
    </main>
  );
}

function ReportProblem({ questionId, version, compact = false }: { questionId: string; version: number; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState(false);
  const [pending, start] = useTransition();
  if (sent) return <span className="text-[13px] text-muted" role="status">Thanks. A reviewer will look.</span>;
  if (!open)
    return (
      <button className={`text-[13px] text-muted underline underline-offset-4 ${compact ? "" : "self-start py-2"}`} onClick={() => setOpen(true)}>
        Report a problem
      </button>
    );
  return (
    <form
      className={`flex flex-col gap-2 rounded-2xl border border-border bg-surface p-4 ${compact ? "fixed inset-x-4 bottom-4 z-40 mx-auto max-w-lg shadow-lg" : ""}`}
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        start(async () => {
          await reportProblem({ questionId, questionVersion: version, reason: fd.get("reason") as "other", message: String(fd.get("message") ?? "") || undefined });
          setSent(true);
        });
      }}
    >
      <label className="label" htmlFor={`reason-${questionId}-${compact}`}>What’s wrong?</label>
      <select id={`reason-${questionId}-${compact}`} name="reason" className="input">
        <option value="wrong_answer">The marked answer looks wrong</option>
        <option value="unclear">The question is unclear</option>
        <option value="outdated">Outdated for current Prometheus</option>
        <option value="typo">Typo or formatting</option>
        <option value="other">Something else</option>
      </select>
      <label className="label" htmlFor={`msg-${questionId}-${compact}`}>Details (optional)</label>
      <textarea id={`msg-${questionId}-${compact}`} name="message" className="input min-h-20" maxLength={2000} />
      <div className="flex gap-2">
        <button className="btn-primary h-11 flex-1" disabled={pending}>Send</button>
        <button type="button" className="btn-ghost h-11" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </form>
  );
}
