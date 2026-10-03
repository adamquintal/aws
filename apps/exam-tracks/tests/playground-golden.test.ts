import { describe, expect, it } from "vitest";
import golden from "./fixtures/promql-golden.json";
import { generate } from "@/lib/promql/dataset";
import { Engine, labelsKey, type Value } from "@/lib/promql/engine";

type PromSample = { metric: Record<string, string>; value?: [number, string]; values?: [number, string][] };
const engine = new Engine(generate());

function num(s: string) {
  if (s === "NaN") return NaN;
  if (s === "+Inf") return Infinity;
  if (s === "-Inf") return -Infinity;
  return Number(s);
}
function close(a: number, b: number) {
  if (Number.isNaN(a) || Number.isNaN(b)) return Number.isNaN(a) && Number.isNaN(b);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return a === b;
  return Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
}

function compareInstant(v: Value, resultType: string | undefined, result: unknown): string | null {
  if (v.type !== resultType) return `type ${v.type} vs ${resultType}`;
  if (v.type === "scalar") return close(v.value, num((result as [number, string])[1])) ? null : `scalar ${v.value} vs ${(result as [number, string])[1]}`;
  if (v.type === "string") return v.value === (result as [number, string])[1] ? null : "string differs";
  const expected = new Map<string, number | [number, number][]>();
  for (const s of result as PromSample[]) {
    expected.set(labelsKey(s.metric), s.value ? num(s.value[1]) : s.values!.map(([t, x]) => [t * 1000, num(x)]));
  }
  const got = new Map<string, number | [number, number][]>();
  if (v.type === "vector") v.samples.forEach((s) => got.set(labelsKey(s.labels), s.value));
  else v.series.forEach((s) => got.set(labelsKey(s.labels), s.points.map((p) => [p.t, p.v])));
  if (got.size !== expected.size) return `series count ${got.size} vs ${expected.size}: got [${[...got.keys()].slice(0, 3).join(" ; ")}] want [${[...expected.keys()].slice(0, 3).join(" ; ")}]`;
  for (const [k, ev] of expected) {
    if (!got.has(k)) return `missing series ${k}`;
    const gv = got.get(k)!;
    if (typeof ev === "number") { if (!close(gv as number, ev)) return `${k}: ${gv} vs ${ev}`; }
    else {
      const gp = gv as [number, number][];
      if (gp.length !== ev.length) return `${k}: ${gp.length} points vs ${ev.length}`;
      for (let i = 0; i < ev.length; i++) if (gp[i][0] !== ev[i][0] || !close(gp[i][1], ev[i][1])) return `${k}: point ${i} ${gp[i]} vs ${ev[i]}`;
    }
  }
  return null;
}

describe(`playground engine matches Prometheus ${golden.prometheus}`, () => {
  for (const c of golden.instant) {
    it(`${c.query} @ ${(c.time * 1000 - golden.dataEnd) / 60000}m`, () => {
      let v: Value | null = null, err: string | null = null;
      try { v = engine.instantQuery(c.query, c.time * 1000); } catch (e) { err = (e as Error).message; }
      if (c.status !== "success") {
        expect(err, `Prometheus errored (${c.error}); the playground returned a result`).not.toBeNull();
        return;
      }
      expect(err).toBeNull();
      expect(compareInstant(v!, c.resultType, c.result)).toBeNull();
    });
  }
  for (const c of golden.range) {
    it(`range: ${c.query}`, () => {
      if (c.status !== "success") {
        expect(() => engine.rangeQuery(c.query, c.start * 1000, c.end * 1000, c.step * 1000), `Prometheus errored (${c.error})`).toThrow();
        return;
      }
      const series = engine.rangeQuery(c.query, c.start * 1000, c.end * 1000, c.step * 1000);
      const v: Value = { type: "matrix", series };
      expect(compareInstant(v, "matrix", c.result)).toBeNull();
    });
  }
});
