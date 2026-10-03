"use client";
import { useState } from "react";

/** Readiness sparkline: one series, no axes. Crosshair + tooltip on hover/touch, table fallback. */
export function Sparkline({ points, label }: { points: { day: string; score: number }[]; label: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 342, H = 72, pad = 6;
  const n = points.length;
  const max = Math.max(20, ...points.map((p) => p.score));
  const x = (i: number) => (n <= 1 ? W - pad : pad + (i * (W - pad * 2)) / (n - 1));
  const y = (v: number) => H - pad - (v / max) * (H - pad * 2);
  const d = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.score).toFixed(1)}`).join("");
  const h = hover != null ? points[hover] : null;
  const pick = (clientX: number, el: SVGSVGElement) => {
    const r = el.getBoundingClientRect();
    const px = ((clientX - r.left) / r.width) * W;
    let best = 0;
    points.forEach((_, i) => { if (Math.abs(x(i) - px) < Math.abs(x(best) - px)) best = i; });
    setHover(best);
  };
  if (!n) return null;
  return (
    <figure className="m-0">
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="block w-full touch-none" role="img"
          aria-label={`${label}: from ${Math.round(points[0].score)}% on ${points[0].day} to ${Math.round(points[n - 1].score)}% today`}
          onMouseLeave={() => setHover(null)} onTouchEnd={() => setHover(null)}
          onMouseMove={(e) => pick(e.clientX, e.currentTarget)} onTouchMove={(e) => pick(e.touches[0].clientX, e.currentTarget)}>
          {n > 1 && <path d={d} fill="none" stroke="var(--series-1)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />}
          {h && hover != null && <line x1={x(hover)} x2={x(hover)} y1={0} y2={H} stroke="rgb(var(--muted))" strokeWidth={1} strokeDasharray="3 3" />}
          <circle cx={x(hover ?? n - 1)} cy={y((h ?? points[n - 1]).score)} r={4} fill="var(--series-1)" stroke="var(--chart-surface)" strokeWidth={2} />
        </svg>
        {h && hover != null && (
          <div className="pointer-events-none absolute -top-8 rounded-lg border border-border bg-surface px-2 py-1 text-xs shadow-sm"
            style={{ left: `${(x(hover) / W) * 100}%`, transform: "translateX(-50%)" }}>
            {h.day}: <b className="font-semibold">{Math.round(h.score)}%</b>
          </div>
        )}
      </div>
      <details className="mt-2 text-[13px] text-muted">
        <summary className="cursor-pointer">Show as table</summary>
        <table className="mt-2 w-full text-left">
          <caption className="sr-only">{label}</caption>
          <thead><tr><th className="py-1 font-medium">Day</th><th className="py-1 font-medium">Readiness</th></tr></thead>
          <tbody>{points.map((p) => <tr key={p.day} className="border-t border-border"><td className="py-1">{p.day}</td><td>{Math.round(p.score)}%</td></tr>)}</tbody>
        </table>
      </details>
    </figure>
  );
}
