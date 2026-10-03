"use client";
import { useId, useState } from "react";

const pct = (n: number | null) => (n == null ? "–" : `${Math.round(n * 100)}%`);

/** Single-series readiness trend with crosshair tooltip. Single series: no legend; the heading names it. */
export function TrendChart({ points, label }: { points: { day: string; score: number }[]; label: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 640, H = 180, P = { l: 36, r: 12, t: 12, b: 24 };
  const n = points.length;
  const x = (i: number) => P.l + (n <= 1 ? (W - P.l - P.r) / 2 : (i * (W - P.l - P.r)) / (n - 1));
  const y = (v: number) => P.t + (1 - v / 100) * (H - P.t - P.b);
  const path = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.score).toFixed(1)}`).join("");
  const h = hover != null ? points[hover] : null;

  return (
    <figure className="space-y-2">
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`${label}: latest ${Math.round(points.at(-1)?.score ?? 0)}%`}
          onMouseLeave={() => setHover(null)}
          onMouseMove={(e) => {
            const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
            const px = ((e.clientX - r.left) / r.width) * W;
            let best = 0;
            points.forEach((_, i) => { if (Math.abs(x(i) - px) < Math.abs(x(best) - px)) best = i; });
            setHover(best);
          }}>
          {[0, 50, 100].map((v) => (
            <g key={v}>
              <line x1={P.l} x2={W - P.r} y1={y(v)} y2={y(v)} stroke="rgb(var(--border))" strokeWidth={1} />
              <text x={P.l - 6} y={y(v) + 4} textAnchor="end" fontSize={11} fill="rgb(var(--muted))">{v}%</text>
            </g>
          ))}
          {n > 1 && <path d={path} fill="none" stroke="var(--series-1)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />}
          {n > 0 && <circle cx={x(n - 1)} cy={y(points[n - 1].score)} r={4} fill="var(--series-1)" stroke="var(--chart-surface)" strokeWidth={2} />}
          {h && hover != null && (
            <g>
              <line x1={x(hover)} x2={x(hover)} y1={P.t} y2={H - P.b} stroke="rgb(var(--muted))" strokeWidth={1} strokeDasharray="3 3" />
              <circle cx={x(hover)} cy={y(h.score)} r={5} fill="var(--series-1)" stroke="var(--chart-surface)" strokeWidth={2} />
            </g>
          )}
          {n > 0 && (
            <>
              <text x={P.l} y={H - 6} fontSize={11} fill="rgb(var(--muted))">{points[0].day}</text>
              {n > 1 && <text x={W - P.r} y={H - 6} fontSize={11} textAnchor="end" fill="rgb(var(--muted))">{points[n - 1].day}</text>}
            </>
          )}
        </svg>
        {h && hover != null && (
          <div className="pointer-events-none absolute top-0 rounded-lg border border-border bg-surface px-2 py-1 text-xs shadow"
            style={{ left: `${(x(hover) / W) * 100}%`, transform: "translateX(-50%)" }}>
            {h.day}: <strong>{Math.round(h.score)}%</strong>
          </div>
        )}
      </div>
      <DataTable caption={label} head={["Day", "Readiness"]} rows={points.map((p) => [p.day, `${Math.round(p.score)}%`])} />
    </figure>
  );
}

/** Horizontal bars, one measure per row (0–1), with a threshold marker. */
export function Bars({ rows, threshold, label }: { rows: { key: string; label: string; value: number | null; detail?: string }[]; threshold?: number; label: string }) {
  const [hover, setHover] = useState<string | null>(null);
  return (
    <figure className="space-y-2">
      <ul className="space-y-3" aria-label={label}>
        {rows.map((r) => (
          <li key={r.key} onMouseEnter={() => setHover(r.key)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(r.key)} onBlur={() => setHover(null)} tabIndex={0} className="relative outline-none">
            <div className="flex justify-between text-sm"><span>{r.label}</span><span className="font-medium">{pct(r.value)}</span></div>
            <div className="relative mt-1 h-3 rounded-full bg-border/60">
              <div className="h-full rounded-full" style={{ width: `${(r.value ?? 0) * 100}%`, background: "var(--series-1)" }} />
              {threshold != null && (
                <div className="absolute -top-1 h-5 w-0.5 bg-fg/60" style={{ left: `${threshold * 100}%` }} aria-hidden />
              )}
            </div>
            {hover === r.key && r.detail && (
              <div role="tooltip" className="absolute right-0 top-full z-10 mt-1 rounded-lg border border-border bg-surface px-2 py-1 text-xs shadow">{r.detail}</div>
            )}
          </li>
        ))}
      </ul>
      {threshold != null && <figcaption className="text-xs text-muted">The thin line marks {Math.round(threshold * 100)}%, the level each domain should reach before booking.</figcaption>}
      <DataTable caption={label} head={["", "Value", "Detail"]} rows={rows.map((r) => [r.label, pct(r.value), r.detail ?? ""])} />
    </figure>
  );
}

/** Two series per row: first-attempt vs recent accuracy. Legend + direct value labels, so color is never the only cue. */
export function PairedBars({ rows }: { rows: { key: string; label: string; first: number | null; recent: number | null }[] }) {
  return (
    <figure className="space-y-3">
      <div className="flex flex-wrap gap-4 text-sm" aria-hidden>
        <span className="flex items-center gap-2"><span className="inline-block h-3 w-3 rounded-sm" style={{ background: "var(--series-2)" }} />First try</span>
        <span className="flex items-center gap-2"><span className="inline-block h-3 w-3 rounded-sm" style={{ background: "var(--series-1)" }} />Recently</span>
      </div>
      <ul className="space-y-4">
        {rows.map((r) => (
          <li key={r.key}>
            <div className="text-sm">{r.label}</div>
            {[["First try", r.first, "--series-2"], ["Recently", r.recent, "--series-1"]].map(([name, v, c]) => (
              <div key={name as string} className="mt-1 flex items-center gap-2">
                <div className="h-2.5 flex-1 rounded-full bg-border/60">
                  <div className="h-full rounded-full" style={{ width: `${((v as number | null) ?? 0) * 100}%`, background: `var(${c})` }} />
                </div>
                <span className="w-24 text-right text-xs text-muted">{name as string} {pct(v as number | null)}</span>
              </div>
            ))}
          </li>
        ))}
      </ul>
      <DataTable caption="Since day one" head={["Domain", "First try", "Recently"]} rows={rows.map((r) => [r.label, pct(r.first), pct(r.recent)])} />
    </figure>
  );
}

function DataTable({ caption, head, rows }: { caption: string; head: string[]; rows: string[][] }) {
  const id = useId();
  return (
    <details className="text-sm">
      <summary className="cursor-pointer text-muted">Show as table</summary>
      <table className="mt-2 w-full text-left" aria-describedby={id}>
        <caption id={id} className="sr-only">{caption}</caption>
        <thead><tr>{head.map((h) => <th key={h} className="border-b border-border py-1 pr-2 font-medium">{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className="border-b border-border py-1 pr-2">{c}</td>)}</tr>)}</tbody>
      </table>
    </details>
  );
}
