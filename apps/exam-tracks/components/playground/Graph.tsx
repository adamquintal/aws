"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Series } from "@/lib/promql/engine";

const MAX_SERIES = 8;
const H = 220, M = { l: 52, r: 10, t: 10, b: 24 };

export const fmtTime = (ms: number) => new Date(ms).toISOString().slice(11, 16);
export function fmtValue(v: number): string {
  if (Number.isNaN(v)) return "NaN";
  if (!Number.isFinite(v)) return v > 0 ? "+Inf" : "-Inf";
  const a = Math.abs(v);
  if (a >= 1e9) return (v / 1e9).toPrecision(3) + "G";
  if (a >= 1e6) return (v / 1e6).toPrecision(3) + "M";
  if (a >= 1e4) return (v / 1e3).toPrecision(3) + "k";
  if (a === 0) return "0";
  return String(Number(v.toPrecision(4)));
}

function niceTicks(min: number, max: number, count = 4): number[] {
  if (min === max) { min -= 1; max += 1; }
  const step0 = (max - min) / count;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= step0)!;
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-9; v += step) out.push(Number(v.toPrecision(12)));
  return out;
}

/** Labels that differ between series: the useful part of a legend. */
export function varyingLabels(series: Series[]): string[] {
  const names = new Set(series.flatMap((s) => Object.keys(s.labels)));
  return [...names].filter((n) => new Set(series.map((s) => s.labels[n] ?? "")).size > 1).sort();
}
export function legendText(labels: Record<string, string>, vary: string[]): string {
  const keys = vary.length ? vary : Object.keys(labels).filter((k) => k !== "__name__");
  const txt = keys.filter((k) => labels[k] !== undefined).map((k) => `${k}="${labels[k]}"`).join(", ");
  return txt || labels.__name__ || "value";
}

export function Graph({ series, start, end, stepMs }: { series: Series[]; start: number; end: number; stepMs: number }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(340);
  const [hover, setHover] = useState<number | null>(null);
  useEffect(() => {
    if (!wrap.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(260, Math.floor(e.contentRect.width))));
    ro.observe(wrap.current);
    return () => ro.disconnect();
  }, []);

  const shown = series.slice(0, MAX_SERIES);
  const vary = useMemo(() => varyingLabels(shown), [shown]);
  const { ymin, ymax, ticks } = useMemo(() => {
    const vals = shown.flatMap((s) => s.points.map((p) => p.v)).filter(Number.isFinite);
    let lo = vals.length ? Math.min(...vals) : 0, hi = vals.length ? Math.max(...vals) : 1;
    if (lo > 0 && lo < hi * 0.5) lo = 0; // anchor at zero when it doesn't flatten the data
    const t = niceTicks(lo, hi);
    return { ymin: Math.min(lo, t[0]), ymax: Math.max(hi, t[t.length - 1]), ticks: t };
  }, [shown]);

  const iw = w - M.l - M.r, ih = H - M.t - M.b;
  const x = (t: number) => M.l + ((t - start) / Math.max(1, end - start)) * iw;
  const y = (v: number) => M.t + ih - ((v - ymin) / (ymax - ymin || 1)) * ih;
  const xticks = useMemo(() => {
    const n = Math.max(2, Math.min(5, Math.floor(iw / 80)));
    return Array.from({ length: n + 1 }, (_, i) => start + ((end - start) * i) / n);
  }, [start, end, iw]);

  const paths = shown.map((s) => {
    let d = "";
    let prev: number | null = null;
    for (const p of s.points) {
      if (!Number.isFinite(p.v)) { prev = null; continue; }
      d += `${prev === null || p.t - prev > stepMs * 1.5 ? "M" : "L"}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`;
      prev = p.t;
    }
    return d;
  });

  const hoverT = hover === null ? null : Math.min(end, Math.max(start, start + Math.round((hover - start) / stepMs) * stepMs));
  const rows = hoverT === null ? [] : shown
    .map((s, i) => ({ i, label: legendText(s.labels, vary), v: s.points.find((p) => p.t === hoverT)?.v }))
    .filter((r) => r.v !== undefined)
    .sort((a, b) => (b.v as number) - (a.v as number));

  return (
    <div ref={wrap} className="relative">
      <div aria-live="off" className="mb-1 min-h-[3.25rem] text-[12px]">
        {hoverT !== null && rows.length > 0 ? (
          <>
            <p className="text-muted">{fmtTime(hoverT)} UTC</p>
            <p className="flex flex-wrap gap-x-3 gap-y-0.5">
              {rows.slice(0, 4).map((r) => (
                <span key={r.i} className="flex items-center gap-1.5 whitespace-nowrap">
                  <span aria-hidden className="inline-block h-0.5 w-3 rounded" style={{ background: `var(--cat-${r.i + 1})` }} />
                  <b className="font-mono font-semibold">{fmtValue(r.v as number)}</b>
                  <span className="max-w-[9rem] truncate text-muted">{r.label}</span>
                </span>
              ))}
              {rows.length > 4 && <span className="text-muted">+{rows.length - 4} more</span>}
            </p>
          </>
        ) : (
          <p className="pt-3 text-muted">Touch or hover the graph to read values.</p>
        )}
      </div>
      <svg width={w} height={H} role="img" aria-label={`Graph of ${series.length} series from ${fmtTime(start)} to ${fmtTime(end)} UTC. The Table view lists the values.`}
        onPointerMove={(e) => { const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect(); const px = e.clientX - r.left; setHover(start + ((px - M.l) / iw) * (end - start)); }}
        onPointerLeave={() => setHover(null)} className="touch-none select-none">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={M.l} x2={w - M.r} y1={y(t)} y2={y(t)} stroke="rgb(var(--border))" strokeWidth={1} />
            <text x={M.l - 6} y={y(t)} dy="0.32em" textAnchor="end" fontSize={11} fill="rgb(var(--muted))">{fmtValue(t)}</text>
          </g>
        ))}
        {xticks.map((t) => (
          <text key={t} x={x(t)} y={H - 6} textAnchor={t === xticks[0] ? "start" : t === xticks[xticks.length - 1] ? "end" : "middle"} fontSize={11} fill="rgb(var(--muted))">{fmtTime(t)}</text>
        ))}
        {paths.map((d, i) => <path key={i} d={d} fill="none" stroke={`var(--cat-${i + 1})`} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />)}
        {hoverT !== null && (
          <g>
            <line x1={x(hoverT)} x2={x(hoverT)} y1={M.t} y2={M.t + ih} stroke="rgb(var(--muted))" strokeWidth={1} />
            {rows.map((r) => <circle key={r.i} cx={x(hoverT)} cy={y(r.v as number)} r={4} fill={`var(--cat-${r.i + 1})`} stroke="rgb(var(--surface))" strokeWidth={2} />)}
          </g>
        )}
      </svg>
      <ul className="mt-2 flex list-none flex-col gap-1 p-0 text-[13px]">
        {shown.map((s, i) => (
          <li key={i} className="flex items-center gap-2">
            <span aria-hidden className="inline-block h-0.5 w-4 shrink-0 rounded" style={{ background: `var(--cat-${i + 1})` }} />
            <span className="min-w-0 font-mono text-[12px] text-soft [overflow-wrap:anywhere]">{legendText(s.labels, vary)}</span>
          </li>
        ))}
      </ul>
      {series.length > MAX_SERIES && (
        <p className="mt-2 text-[13px] text-muted">Showing {MAX_SERIES} of {series.length} series. Aggregate or filter to see the rest here; the Table view lists them all.</p>
      )}
    </div>
  );
}
