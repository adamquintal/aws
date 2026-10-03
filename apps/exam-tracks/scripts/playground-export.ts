// Export the playground dataset as OpenMetrics text, for loading into a real
// Prometheus with `promtool tsdb create-blocks-from openmetrics` (golden tests).
import fs from "node:fs";
import { generate, familyOf } from "../lib/promql/dataset";

const out = process.argv[2] ?? "playground.om";
const d = generate();
const esc = (v: string) => v.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
const fmt = (labels: Record<string, string>) => {
  const ks = Object.keys(labels).filter((k) => k !== "__name__");
  return ks.length ? `{${ks.map((k) => `${k}="${esc(labels[k])}"`).join(",")}}` : "";
};
const byFamily = new Map<string, typeof d.series>();
for (const s of d.series) {
  const f = familyOf(s.labels.__name__);
  if (!byFamily.has(f)) byFamily.set(f, []);
  byFamily.get(f)!.push(s);
}
const lines: string[] = [];
for (const [fam, series] of byFamily) {
  const meta = d.families[fam];
  // Typed as gauge/unknown so OpenMetrics' counter/histogram structure rules don't apply;
  // PromQL doesn't use the type, only the samples.
  const omName = fam;
  lines.push(`# TYPE ${omName} ${meta.type === "gauge" ? "gauge" : "unknown"}`);
  for (const s of series) {
    const name = s.labels.__name__;
    const lbl = fmt(s.labels);
    for (let i = 0; i < s.t.length; i++) lines.push(`${name}${lbl} ${String(s.v[i])} ${(s.t[i] / 1000).toFixed(3)}`);
  }
}
lines.push("# EOF");
fs.writeFileSync(out, lines.join("\n") + "\n");
console.log(`wrote ${out}: ${d.series.length} series`);
