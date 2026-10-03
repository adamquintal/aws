"use client";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { getEngine } from "@/lib/promql/shared";
import { DATA_END, DATA_HOURS } from "@/lib/promql/dataset";
import { formatLabels, labelsKey, type Series, type Value } from "@/lib/promql/engine";
import { CHALLENGES, checkChallenge, type Challenge } from "@/lib/promql/challenges";
import { recordPlaygroundSolve } from "@/app/actions";
import { Graph, fmtTime } from "./Graph";
import { IconCheck } from "../Icons";

type Family = { name: string; type: string; help: string };
type Props = { initialQuery: string; initialChallenge: string | null; solved: string[]; families: Family[]; topics: { id: string; title: string }[] };

const PRESETS = [
  { min: 0, label: "End of data" },
  { min: -43, label: "During the incident" },
  { min: -80, label: "api-3 restart" },
];
const WINDOWS = [{ min: 30, label: "30m" }, { min: 60, label: "1h" }, { min: 180, label: "3h" }];

export function Playground({ initialQuery, initialChallenge, solved: solvedInit, families, topics }: Props) {
  const [ready, setReady] = useState(false);
  const engineRef = useRef<ReturnType<typeof getEngine> | null>(null);
  const [query, setQuery] = useState(initialQuery);
  const [ran, setRan] = useState<string | null>(null);
  const [evalMin, setEvalMin] = useState(0);
  const [view, setView] = useState<"table" | "graph">("table");
  const [windowMin, setWindowMin] = useState(60);
  const [result, setResult] = useState<{ kind: "instant"; v: Value } | { kind: "range"; series: Series[]; start: number; end: number; step: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"explore" | "practice">(initialChallenge ? "practice" : "explore");
  const [active, setActive] = useState<Challenge | null>(CHALLENGES.find((c) => c.id === initialChallenge) ?? null);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [hint, setHint] = useState(false);
  const [answer, setAnswer] = useState(false);
  const [solved, setSolved] = useState(new Set(solvedInit));
  const [, startSave] = useTransition();
  const editor = useRef<HTMLTextAreaElement>(null);

  // Grow the editor to fit its content (also when a task or link fills it).
  useEffect(() => {
    const el = editor.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight + 2, 320)}px`;
  }, [query, mode, active]);

  // Generate the sample data after first paint so the page appears instantly.
  useEffect(() => {
    const id = setTimeout(() => { engineRef.current = getEngine(); setReady(true); }, 0);
    return () => clearTimeout(id);
  }, []);

  const evalTime = DATA_END + evalMin * 60_000;

  const run = useCallback((q: string) => {
    const engine = engineRef.current;
    if (!engine) return;
    setRan(q);
    setError(null);
    try {
      if (view === "table") setResult({ kind: "instant", v: engine.instantQuery(q, evalTime) });
      else {
        const end = evalTime, start = end - windowMin * 60_000;
        const step = Math.max(15_000, Math.round((windowMin * 60_000) / 240 / 15_000) * 15_000);
        setResult({ kind: "range", series: engine.rangeQuery(q, start, end, step), start, end, step });
      }
    } catch (e) {
      setResult(null);
      setError((e as Error).message);
    }
  }, [view, evalTime, windowMin]);

  // Re-run when the view or time changes.
  useEffect(() => { if (ready && ran !== null) run(ran); }, [view, evalMin, windowMin, ready]); // eslint-disable-line react-hooks/exhaustive-deps
  // Run a query passed in the link once the data is ready.
  useEffect(() => { if (ready && initialQuery) run(initialQuery); }, [ready]); // eslint-disable-line react-hooks/exhaustive-deps

  function check() {
    const engine = engineRef.current;
    if (!engine || !active) return;
    run(query);
    const r = checkChallenge(engine, active, query);
    if (r.solved) {
      setFeedback({ ok: true, text: "Your query returns exactly what the task asks for." });
      if (!solved.has(active.id)) {
        setSolved(new Set([...solved, active.id]));
        startSave(async () => { await recordPlaygroundSolve(active.id, query); });
      }
    } else setFeedback({ ok: false, text: r.message });
  }

  function pickChallenge(c: Challenge) {
    setActive(c); setQuery(""); setFeedback(null); setHint(false); setAnswer(false); setResult(null); setError(null); setRan(null);
    setEvalMin(c.checkAtMin?.[0] ?? 0); setView("table");
    window.scrollTo({ top: 0, behavior: "smooth" });
    setTimeout(() => editor.current?.focus(), 50);
  }

  function insert(text: string) {
    setQuery((q) => (q.trim() ? `${q}${/\s$/.test(q) ? "" : " "}${text}` : text));
    editor.current?.focus();
  }

  const unknownMetric = useMemo(() => {
    if (!ready || !ran || !result || result.kind !== "instant" || result.v.type !== "vector" || result.v.samples.length) return null;
    const names = new Set(engineRef.current!.metricNames);
    const ids = ran.replace(/"(?:[^"\\]|\\.)*"|'[^']*'|`[^`]*`/g, "").match(/[a-zA-Z_:][a-zA-Z0-9_:]*(?=\s*[{[\s)]|$)/g) ?? [];
    const KEYWORDS = new Set(["by", "without", "on", "ignoring", "group_left", "group_right", "offset", "bool", "and", "or", "unless", "start", "end"]);
    return ids.find((id) => !names.has(id) && !KEYWORDS.has(id) && !/^(sum|avg|min|max|count|rate|irate|increase|delta|idelta|deriv|predict_linear|histogram_quantile|topk|bottomk|quantile|abs|time|vector|scalar|label_replace|label_join|absent|clamp\w*|round|sort\w*|\w+_over_time|resets|changes|timestamp|group|stddev|stdvar|count_values|ceil|floor|exp|sqrt|ln|log2|log10|sgn|day_of_\w+|days_in_month|hour|minute|month|year|pi)$/.test(id)) ?? null;
  }, [ready, ran, result]);

  const sortedTopLevel = ran ? /^\s*(sort|sort_desc|topk|bottomk)\s*\(/.test(ran) : false;
  const topicTitle = Object.fromEntries(topics.map((t) => [t.id, t.title]));
  const byTopic = topics.map((t) => ({ ...t, items: CHALLENGES.filter((c) => c.topic === t.id) })).filter((g) => g.items.length);
  const nextUnsolved = active ? CHALLENGES.slice(CHALLENGES.indexOf(active) + 1).find((c) => !solved.has(c.id)) ?? CHALLENGES.find((c) => !solved.has(c.id) && c !== active) : null;

  return (
    <div className="flex flex-col gap-6 pb-16">
      <div role="tablist" aria-label="Playground mode" className="grid grid-cols-2 rounded-2xl border border-border bg-surface p-1">
        {(["explore", "practice"] as const).map((m) => (
          <button key={m} role="tab" aria-selected={mode === m} onClick={() => setMode(m)}
            className={`h-10 rounded-xl text-[15px] ${mode === m ? "bg-ink font-semibold text-on-ink" : "text-soft"}`}>
            {m === "explore" ? "Explore" : `Practice · ${solved.size}/${CHALLENGES.length}`}
          </button>
        ))}
      </div>

      {mode === "practice" && !active && (
        <section aria-labelledby="tasks" className="flex flex-col gap-6">
          <p id="tasks" className="text-[15px] leading-relaxed text-soft">Short tasks on the sample data, in path order. Write a query; it’s checked by comparing its result with the answer’s.</p>
          {byTopic.map((g) => (
            <div key={g.id}>
              <h2 className="eyebrow mb-1">{g.title}</h2>
              <ul className="m-0 list-none border-t border-border p-0">
                {g.items.map((c) => (
                  <li key={c.id}>
                    <button onClick={() => pickChallenge(c)} className="row w-full gap-3 text-left hover:opacity-80">
                      <span className="min-w-0">{c.title}</span>
                      {solved.has(c.id) ? <span className="flex shrink-0 items-center gap-1 text-[13px] text-accent"><IconCheck size={14} />Solved</span> : <span className="shrink-0 text-[13px] text-muted">Try it</span>}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      )}

      {mode === "practice" && active && (
        <section aria-labelledby="task-title" className="rounded-2xl border border-border bg-surface p-5">
          <div className="flex items-baseline justify-between gap-3">
            <p className="eyebrow">{topicTitle[active.topic]}</p>
            <button className="text-[13px] text-muted underline underline-offset-4" onClick={() => setActive(null)}>All tasks</button>
          </div>
          <h2 id="task-title" className="mt-2 font-serif text-[26px] leading-tight">{active.title}{solved.has(active.id) && <span className="ml-2 align-middle text-[13px] font-sans text-accent">Solved</span>}</h2>
          <p className="mt-2 text-[16px] leading-relaxed text-soft">{active.prompt}</p>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
            {!hint && <button className="text-muted underline underline-offset-4" onClick={() => setHint(true)}>I’m stuck</button>}
            {hint && !answer && <button className="text-muted underline underline-offset-4" onClick={() => setAnswer(true)}>Show the answer</button>}
            <a className="link" href={active.doc.url} target="_blank" rel="noreferrer">Docs: {active.doc.title}</a>
          </div>
          {hint && <p className="mt-3 text-[15px] text-soft"><span className="font-semibold text-fg">Hint.</span> {active.hint}</p>}
          {answer && <p className="mt-2 break-all rounded-lg bg-track/50 px-3 py-2 font-mono text-[13px]">{active.reference}</p>}
        </section>
      )}

      {(mode === "explore" || active) && (
        <>
          <div className="flex flex-col gap-2">
            <label htmlFor="promql" className="label">PromQL</label>
            <textarea id="promql" ref={editor} value={query} onChange={(e) => setQuery(e.target.value)} spellCheck={false} autoCapitalize="off" autoCorrect="off"
              onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); if (mode === "practice") check(); else run(query); } }}
              rows={2}
              onInput={(e) => { const el = e.currentTarget; el.style.height = "auto"; el.style.height = `${Math.min(el.scrollHeight + 2, 320)}px`; }}
              placeholder={mode === "practice" ? "Write your query…" : 'e.g. sum by (job) (rate(http_requests_total[5m]))'}
              className="w-full resize-y rounded-2xl border border-border bg-surface px-4 py-3 font-mono text-[15px] leading-relaxed text-fg outline-none focus:border-fg" />
            <div className="flex gap-2.5">
              {mode === "practice" ? (
                <>
                  <button className="btn-ghost h-12 px-5" onClick={() => run(query)} disabled={!ready || !query.trim()}>Run</button>
                  <button className="btn-primary h-12 flex-1" onClick={check} disabled={!ready || !query.trim()}>{ready ? "Check" : "Loading data…"}</button>
                </>
              ) : (
                <button className="btn-primary h-12 flex-1" onClick={() => run(query)} disabled={!ready || !query.trim()}>{ready ? "Run query" : "Loading data…"}</button>
              )}
            </div>
            <p className="hidden text-[12px] text-muted sm:block">Ctrl or Cmd + Enter to {mode === "practice" ? "check" : "run"}.</p>
          </div>

          {feedback && (
            <div role="status" className={`rounded-2xl px-4 py-3 ${feedback.ok ? "bg-accent/10" : "bg-trap"}`}>
              <p className={`font-serif text-[24px] leading-tight ${feedback.ok ? "text-accent" : "text-gentle"}`}>{feedback.ok ? "Right." : "Not quite."}</p>
              <p className="mt-1 text-[15px] leading-relaxed text-soft [overflow-wrap:anywhere]">{feedback.text}</p>
              {feedback.ok && nextUnsolved && <button className="btn-primary mt-3 h-11 w-full" onClick={() => pickChallenge(nextUnsolved)}>Next task: {nextUnsolved.title}</button>}
            </div>
          )}

          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <div role="tablist" aria-label="Result view" className="flex rounded-xl border border-border bg-surface p-0.5">
                {(["table", "graph"] as const).map((v) => (
                  <button key={v} role="tab" aria-selected={view === v} onClick={() => setView(v)} className={`h-9 rounded-lg px-4 text-[14px] ${view === v ? "bg-ink font-semibold text-on-ink" : "text-soft"}`}>{v === "table" ? "Table" : "Graph"}</button>
                ))}
              </div>
              <span className="text-[13px] text-muted">{view === "table" ? `At ${fmtTime(evalTime)} UTC` : `${fmtTime(evalTime - windowMin * 60_000)}–${fmtTime(evalTime)} UTC`}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((p) => (
                <button key={p.min} onClick={() => setEvalMin(p.min)} aria-pressed={evalMin === p.min}
                  className={`h-8 rounded-full px-3 text-[13px] ${evalMin === p.min ? "bg-ink text-on-ink" : "border border-border bg-surface text-soft"}`}>{p.label}</button>
              ))}
              {view === "graph" && WINDOWS.map((wd) => (
                <button key={wd.min} onClick={() => setWindowMin(wd.min)} aria-pressed={windowMin === wd.min}
                  className={`h-8 rounded-full px-3 text-[13px] ${windowMin === wd.min ? "bg-fg/10 font-semibold text-fg" : "text-muted"}`}>{wd.label}</button>
              ))}
            </div>
            <label className="flex items-center gap-3 text-[13px] text-muted">
              <span className="shrink-0">Time</span>
              <input type="range" min={-DATA_HOURS * 60} max={0} step={1} value={evalMin} onChange={(e) => setEvalMin(Number(e.target.value))} className="w-full accent-[rgb(var(--accent))]" aria-label="Evaluation time, minutes before the end of the data" />
              <span className="w-12 shrink-0 text-right font-mono">{evalMin === 0 ? "end" : `${evalMin}m`}</span>
            </label>
          </div>

          <section aria-live="polite" aria-label="Result">
            {error && <p className="rounded-2xl bg-trap px-4 py-3 text-[15px] leading-relaxed text-soft [overflow-wrap:anywhere]"><span className="font-semibold text-gentle">Error.</span> {error}</p>}
            {!error && result?.kind === "instant" && <InstantResult v={result.v} keepOrder={sortedTopLevel} unknownMetric={unknownMetric} />}
            {!error && result?.kind === "range" && (
              result.series.length ? <Graph series={result.series} start={result.start} end={result.end} stepMs={result.step} /> : <p className="text-[15px] text-muted">No data in this time window.</p>
            )}
            {!error && !result && ready && <p className="text-[15px] text-muted">Run a query to see results.</p>}
          </section>
        </>
      )}

      {mode === "explore" && (
        <>
          <details className="group rounded-2xl border border-border bg-surface">
            <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-[15px] font-semibold">
              Metrics in this data ({families.length})<span aria-hidden className="text-muted transition-transform group-open:rotate-90">›</span>
            </summary>
            <ul className="m-0 list-none border-t border-border p-0">
              {families.map((f) => (
                <li key={f.name} className="border-b border-border px-4 py-3 last:border-b-0">
                  <button className="text-left font-mono text-[14px] text-accent [overflow-wrap:anywhere] hover:underline" onClick={() => insert(f.type === "histogram" ? `${f.name}_bucket` : f.name)}>{f.name}</button>
                  <span className="ml-2 rounded bg-track/60 px-1.5 py-0.5 text-[11px] uppercase tracking-wide text-muted">{f.type}</span>
                  <p className="mt-1 text-[13px] leading-snug text-muted">{f.help}</p>
                </li>
              ))}
            </ul>
          </details>
          <section aria-labelledby="story" className="text-[14px] leading-relaxed text-soft">
            <h2 id="story" className="eyebrow mb-2">What’s in the data</h2>
            <ul className="m-0 flex list-disc flex-col gap-1 pl-5">
              <li>Three hours of 15-second scrapes from 3 API servers, a database, 2 nodes, a worker and a Pushgateway, ending {new Date(DATA_END).toUTCString().slice(5, 22)} UTC.</li>
              <li>api-2 has an incident 50–35 minutes before the end: 5xx errors and slow requests.</li>
              <li>api-3 restarted 80 minutes before the end (counters reset; version 1.4.2 → 1.5.0).</li>
              <li>node-2’s disk is filling; api-1 is slowly leaking memory; the email queue backs up near the end.</li>
              <li>The nightly-report batch job last succeeded 26 hours ago.</li>
            </ul>
            <p className="mt-3 text-[13px] text-muted">The query engine runs in your browser and is tested against Prometheus 3.14 on this same data. It covers float samples, the common functions and all operators; native histograms aren’t included.</p>
          </section>
        </>
      )}
    </div>
  );
}

function InstantResult({ v, keepOrder, unknownMetric }: { v: Value; keepOrder: boolean; unknownMetric: string | null }) {
  if (v.type === "scalar") return <p className="font-serif text-[40px] leading-none">{fmtFull(v.value)} <span className="font-sans text-[13px] text-muted">scalar</span></p>;
  if (v.type === "string") return <p className="font-mono text-[15px]">&quot;{v.value}&quot; <span className="font-sans text-[13px] text-muted">string</span></p>;
  if (v.type === "matrix") {
    return (
      <div>
        <p className="mb-2 text-[13px] text-muted">Range vector: {v.series.length} series. Each lists its raw samples in the window (latest last). Wrap it in a function such as rate() to get one value per series.</p>
        <ul className="m-0 list-none border-t border-border p-0">
          {v.series.slice(0, 100).map((s) => (
            <li key={labelsKey(s.labels)} className="border-b border-border py-3">
              <p className="font-mono text-[13px] [overflow-wrap:anywhere]">{formatLabels(s.labels)}</p>
              <p className="mt-1 font-mono text-[12px] text-muted [overflow-wrap:anywhere]">{s.points.length} samples: {s.points.slice(-4).map((p) => `${fmtFull(p.v)} @${new Date(p.t).toISOString().slice(11, 19)}`).join(", ")}{s.points.length > 4 ? " …" : ""}</p>
            </li>
          ))}
        </ul>
      </div>
    );
  }
  if (!v.samples.length) {
    return (
      <p className="text-[15px] leading-relaxed text-muted">
        Empty result: no series match at this time.
        {unknownMetric && <> This sample data has no metric called <code className="font-mono text-fg">{unknownMetric}</code>; open “Metrics in this data” below to see what’s available.</>}
      </p>
    );
  }
  const rows = keepOrder ? v.samples : [...v.samples].sort((a, b) => (labelsKey(a.labels) < labelsKey(b.labels) ? -1 : 1));
  return (
    <div>
      <p className="mb-2 text-[13px] text-muted">{v.samples.length} series</p>
      <table className="w-full border-t border-border text-left">
        <tbody>
          {rows.slice(0, 300).map((s) => (
            <tr key={labelsKey(s.labels)} className="border-b border-border align-top">
              <td className="py-2.5 pr-3 font-mono text-[13px] leading-snug [overflow-wrap:anywhere]">{formatLabels(s.labels)}</td>
              <td className="whitespace-nowrap py-2.5 text-right font-mono text-[13px] font-semibold">{fmtFull(s.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > 300 && <p className="mt-2 text-[13px] text-muted">Showing 300 of {rows.length}.</p>}
    </div>
  );
}

function fmtFull(v: number): string {
  if (Number.isNaN(v)) return "NaN";
  if (!Number.isFinite(v)) return v > 0 ? "+Inf" : "-Inf";
  return String(Number(v.toPrecision(10)));
}

