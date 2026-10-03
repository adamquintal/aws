"use client";
import { useState, useTransition } from "react";
import { reportProblem } from "@/app/actions";

export function ReportProblem({ questionId, version, compact = false }: { questionId: string; version: number; compact?: boolean }) {
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
