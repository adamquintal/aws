/**
 * A PromQL evaluator for the playground, following Prometheus 3.x semantics for
 * float samples: 5m lookback, left-open range windows, rate() extrapolation,
 * vector matching, name dropping and the same error messages where practical.
 * Checked against real Prometheus by tests/playground-golden.test.ts.
 */
import { COMPARISON, PromQLError, SET_OPS, typeOf, type AggOp, type AtSpec, type BinOp, type Expr, type Matcher, type VectorMatching } from "./ast";
import { parse } from "./parse";
import type { Dataset, Labels, StoredSeries } from "./dataset";

export type Sample = { labels: Labels; value: number; ts?: number };
export type Point = { t: number; v: number };
export type Series = { labels: Labels; points: Point[] };
export type Value =
  | { type: "scalar"; value: number }
  | { type: "string"; value: string }
  | { type: "vector"; samples: Sample[] }
  | { type: "matrix"; series: Series[] };

export const LOOKBACK_MS = 5 * 60_000;
export const DEFAULT_SUBQUERY_STEP_MS = 60_000;
const NAME = "__name__";

export function labelsKey(l: Labels): string {
  return Object.keys(l).sort().map((k) => `${k}\u0000${l[k]}`).join("\u0001");
}
export function formatLabels(l: Labels): string {
  const name = l[NAME] ?? "";
  const rest = Object.keys(l).filter((k) => k !== NAME).sort().map((k) => `${k}="${l[k].replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n")}"`);
  return rest.length ? `${name}{${rest.join(", ")}}` : name || "{}";
}
const dropName = (l: Labels): Labels => { if (!(NAME in l)) return l; const { [NAME]: _n, ...rest } = l; return rest; };

/** Go's strconv.FormatFloat(f, 'f', -1, 64), used for count_values label values. */
export function formatGoFloat(f: number): string {
  if (Number.isNaN(f)) return "NaN";
  if (f === Infinity) return "+Inf";
  if (f === -Infinity) return "-Inf";
  const s = String(f);
  if (!/e/i.test(s)) return s;
  const [mant, expStr] = s.split(/e/i);
  const exp = Number(expStr);
  const neg = mant.startsWith("-");
  const digits = mant.replace(/^-/, "").replace(".", "");
  const intLen = mant.replace(/^-/, "").split(".")[0].length + exp;
  let out: string;
  if (intLen <= 0) out = "0." + "0".repeat(-intLen) + digits;
  else if (intLen >= digits.length) out = digits + "0".repeat(intLen - digits.length);
  else out = digits.slice(0, intLen) + "." + digits.slice(intLen);
  return (neg ? "-" : "") + out;
}

function kahanSum(xs: number[]): number {
  let sum = 0, c = 0;
  for (const x of xs) {
    const t = sum + x;
    if (Math.abs(sum) >= Math.abs(x)) c += sum - t + x;
    else c += x - t + sum;
    sum = t;
  }
  return Number.isFinite(c) ? sum + c : sum;
}

/** Linear-interpolated quantile, as in Prometheus's quantile() and quantile_over_time(). */
function quantile(q: number, values: number[]): number {
  if (!values.length || Number.isNaN(q)) return NaN;
  if (q < 0) return -Infinity;
  if (q > 1) return Infinity;
  const vs = [...values].sort((a, b) => a - b);
  const n = vs.length;
  const rank = q * (n - 1);
  const lower = Math.max(0, Math.floor(rank));
  const upper = Math.min(n - 1, lower + 1);
  const weight = rank - Math.floor(rank);
  return vs[lower] * (1 - weight) + vs[upper] * weight;
}

function popVariance(xs: number[]): number {
  let count = 0, mean = 0, m2 = 0;
  for (const x of xs) {
    count++;
    const delta = x - mean;
    mean += delta / count;
    m2 += delta * (x - mean);
  }
  return m2 / count;
}

function bucketQuantile(q: number, buckets: { upper: number; count: number }[]): number {
  if (Number.isNaN(q)) return NaN;
  if (q < 0) return -Infinity;
  if (q > 1) return Infinity;
  buckets.sort((a, b) => a.upper - b.upper);
  if (!buckets.length || buckets[buckets.length - 1].upper !== Infinity) return NaN;
  // Coalesce equal bounds.
  const bs: { upper: number; count: number }[] = [];
  for (const b of buckets) {
    if (bs.length && bs[bs.length - 1].upper === b.upper) bs[bs.length - 1].count += b.count;
    else bs.push({ ...b });
  }
  // Ensure monotonic counts, ignoring tiny float deltas.
  let prev = bs[0].count;
  for (let i = 1; i < bs.length; i++) {
    const curr = bs[i].count;
    if (curr === prev) continue;
    if (Math.abs(prev - curr) <= 1e-12 * Math.max(Math.abs(prev), Math.abs(curr))) { bs[i].count = prev; continue; }
    if (curr < prev) { bs[i].count = prev; continue; }
    prev = curr;
  }
  if (bs.length < 2) return NaN;
  const observations = bs[bs.length - 1].count;
  if (observations === 0) return NaN;
  let rank = q * observations;
  let b = bs.length - 1;
  for (let i = 0; i < bs.length - 1; i++) if (bs[i].count >= rank) { b = i; break; }
  if (b === bs.length - 1) return bs[bs.length - 2].upper;
  if (b === 0 && bs[0].upper <= 0) return bs[0].upper;
  let start = 0, count = bs[b].count;
  if (b > 0) { start = bs[b - 1].upper; count -= bs[b - 1].count; rank -= bs[b - 1].count; }
  return start + (bs[b].upper - start) * (rank / count);
}

function linearRegression(points: Point[], interceptTime: number): [number, number] {
  let n = 0, sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  const cs = [0, 0, 0, 0];
  const inc = (i: number, sum: number, x: number) => { const t = sum + x; cs[i] += Math.abs(sum) >= Math.abs(x) ? sum - t + x : x - t + sum; return t; };
  const initY = points[0].v;
  let constY = true;
  points.forEach((p, i) => {
    if (constY && i > 0 && p.v !== initY) constY = false;
    n++;
    const x = (p.t - interceptTime) / 1000;
    sumX = inc(0, sumX, x); sumY = inc(1, sumY, p.v); sumXY = inc(2, sumXY, x * p.v); sumX2 = inc(3, sumX2, x * x);
  });
  if (constY) return Number.isFinite(initY) ? [0, initY] : [NaN, NaN];
  sumX += cs[0]; sumY += cs[1]; sumXY += cs[2]; sumX2 += cs[3];
  const covXY = sumXY - (sumX * sumY) / n;
  const varX = sumX2 - (sumX * sumX) / n;
  const slope = covXY / varX;
  return [slope, sumY / n - (slope * sumX) / n];
}

function compileMatcher(m: Matcher): (v: string) => boolean {
  switch (m.type) {
    case "=": return (v) => v === m.value;
    case "!=": return (v) => v !== m.value;
    case "=~": { const re = new RegExp(`^(?:${m.value})$`, "s"); return (v) => re.test(v); }
    case "!~": { const re = new RegExp(`^(?:${m.value})$`, "s"); return (v) => !re.test(v); }
  }
}

/** Index of the last element ≤ x in a sorted array, or -1. */
function lastAtOrBefore(arr: Float64Array, x: number): number {
  let lo = 0, hi = arr.length - 1, ans = -1;
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (arr[mid] <= x) { ans = mid; lo = mid + 1; } else hi = mid - 1; }
  return ans;
}

type VS = Extract<Expr, { kind: "vectorSelector" }>;

export class Engine {
  private byName = new Map<string, StoredSeries[]>();
  private selCache = new WeakMap<VS, StoredSeries[]>();
  private subqCache = new WeakMap<Expr, Map<number, Value>>();
  private start = 0;
  private end = 0;

  constructor(private data: Dataset) {
    for (const s of data.series) {
      const n = s.labels[NAME];
      if (!this.byName.has(n)) this.byName.set(n, []);
      this.byName.get(n)!.push(s);
    }
  }

  get metricNames() { return [...this.byName.keys()].sort(); }

  instantQuery(query: string, time: number): Value {
    const expr = parse(query);
    this.start = this.end = time;
    this.subqCache = new WeakMap();
    return this.evalAt(expr, time);
  }

  rangeQuery(query: string, start: number, end: number, stepMs: number): Series[] {
    const expr = parse(query);
    const t = typeOf(expr);
    if (t !== "vector" && t !== "scalar") throw new PromQLError(`A graph needs an instant vector or a number, but this query returns a ${t === "matrix" ? "range vector" : "string"}. Try the Table view${t === "matrix" ? ", or wrap it in a function such as rate()" : ""}.`);
    if ((end - start) / stepMs > 11_000) throw new PromQLError("Too many points; use a larger step.");
    this.start = start; this.end = end;
    this.subqCache = new WeakMap();
    const out = new Map<string, Series>();
    for (let ts = start; ts <= end; ts += stepMs) {
      const v = this.evalAt(expr, ts);
      const samples = v.type === "scalar" ? [{ labels: {}, value: v.value }] : v.type === "vector" ? v.samples : [];
      for (const s of samples) {
        const k = labelsKey(s.labels);
        if (!out.has(k)) out.set(k, { labels: s.labels, points: [] });
        out.get(k)!.points.push({ t: ts, v: s.value });
      }
    }
    return [...out.values()].sort((a, b) => (labelsKey(a.labels) < labelsKey(b.labels) ? -1 : 1));
  }

  private atTime(at: AtSpec, t: number): number {
    if (!at) return t;
    if (at.kind === "start") return this.start;
    if (at.kind === "end") return this.end;
    return at.t;
  }

  private select(vs: VS): StoredSeries[] {
    const hit = this.selCache.get(vs);
    if (hit) return hit;
    const nameMatchers = vs.matchers.filter((m) => m.name === NAME);
    let candidates: StoredSeries[];
    if (vs.name !== null) candidates = this.byName.get(vs.name) ?? [];
    else candidates = this.data.series;
    const fns = vs.matchers.map((m) => ({ name: m.name, test: compileMatcher(m) }));
    const res = candidates.filter((s) => fns.every((f) => f.test(s.labels[f.name] ?? "")));
    void nameMatchers;
    this.selCache.set(vs, res);
    return res;
  }

  private evalAt(e: Expr, t: number): Value {
    switch (e.kind) {
      case "number": return { type: "scalar", value: e.value };
      case "string": return { type: "string", value: e.value };
      case "paren": return this.evalAt(e.expr, t);
      case "unary": {
        const v = this.evalAt(e.expr, t);
        if (e.op === "+") return v;
        if (v.type === "scalar") return { type: "scalar", value: -v.value };
        if (v.type === "vector") return { type: "vector", samples: this.checkDuplicates(v.samples.map((s) => ({ labels: dropName(s.labels), value: -s.value }))) };
        throw new PromQLError("Unary minus needs a number or an instant vector.");
      }
      case "vectorSelector": {
        const te = this.atTime(e.at, t) - e.offsetMs;
        const out: Sample[] = [];
        for (const s of this.select(e)) {
          const i = lastAtOrBefore(s.t, te);
          if (i >= 0 && s.t[i] > te - LOOKBACK_MS) out.push({ labels: s.labels, value: s.v[i], ts: s.t[i] });
        }
        return { type: "vector", samples: out };
      }
      case "matrixSelector": {
        const vs = e.selector;
        const te = this.atTime(vs.at, t) - vs.offsetMs;
        const series: Series[] = [];
        for (const s of this.select(vs)) {
          const hiIdx = lastAtOrBefore(s.t, te);
          const loIdx = lastAtOrBefore(s.t, te - e.rangeMs); // excluded: window is left-open
          const points: Point[] = [];
          for (let i = loIdx + 1; i <= hiIdx; i++) points.push({ t: s.t[i], v: s.v[i] });
          if (points.length) series.push({ labels: s.labels, points });
        }
        return { type: "matrix", series };
      }
      case "subquery": {
        const step = e.stepMs ?? DEFAULT_SUBQUERY_STEP_MS;
        const te = this.atTime(e.at, t) - e.offsetMs;
        let first = step * Math.floor((te - e.rangeMs) / step);
        if (first <= te - e.rangeMs) first += step;
        const out = new Map<string, Series>();
        let cache = this.subqCache.get(e);
        if (!cache) this.subqCache.set(e, (cache = new Map()));
        for (let ts = first; ts <= te; ts += step) {
          let v = cache.get(ts);
          if (!v) { v = this.evalAt(e.expr, ts); cache.set(ts, v); }
          const samples = v.type === "scalar" ? [{ labels: {}, value: v.value }] : v.type === "vector" ? v.samples : [];
          for (const s of samples) {
            const k = labelsKey(s.labels);
            if (!out.has(k)) out.set(k, { labels: s.labels, points: [] });
            out.get(k)!.points.push({ t: ts, v: s.value });
          }
        }
        return { type: "matrix", series: [...out.values()] };
      }
      case "aggregate": return this.aggregate(e, t);
      case "binary": return this.binary(e, t);
      case "call": return this.call(e, t);
    }
  }

  private scalarArg(e: Expr, t: number): number {
    const v = this.evalAt(e, t);
    if (v.type !== "scalar") throw new PromQLError("Expected a number.");
    return v.value;
  }
  private vectorArg(e: Expr, t: number): Sample[] {
    const v = this.evalAt(e, t);
    if (v.type !== "vector") throw new PromQLError("Expected an instant vector.");
    return v.samples;
  }
  private stringArg(e: Expr, t: number): string {
    const v = this.evalAt(e, t);
    if (v.type !== "string") throw new PromQLError("Expected a string.");
    return v.value;
  }

  private checkDuplicates(samples: Sample[]): Sample[] {
    const seen = new Set<string>();
    for (const s of samples) {
      const k = labelsKey(s.labels);
      if (seen.has(k)) throw new PromQLError("vector cannot contain metrics with the same labelset");
      seen.add(k);
    }
    return samples;
  }

  // ---------- Aggregation ----------

  private aggregate(e: Extract<Expr, { kind: "aggregate" }>, t: number): Value {
    const input = this.vectorArg(e.expr, t);
    const param = e.param ? this.evalAt(e.param, t) : null;
    const groupLabels = (l: Labels): Labels => {
      if (e.without) {
        const out: Labels = {};
        for (const k in l) if (k !== NAME && !e.grouping.includes(k)) out[k] = l[k];
        return out;
      }
      const out: Labels = {};
      for (const k of e.grouping) if (l[k] !== undefined && l[k] !== "") out[k] = l[k];
      return out;
    };

    if (e.op === "count_values") {
      const label = (param as { value: string }).value;
      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(label) && !label) throw new PromQLError(`invalid label name "${label}"`);
      const groups = new Map<string, { labels: Labels; n: number }>();
      for (const s of input) {
        const gl = { ...groupLabels(s.labels), [label]: formatGoFloat(s.value) };
        const k = labelsKey(gl);
        const g = groups.get(k) ?? { labels: gl, n: 0 };
        g.n++;
        groups.set(k, g);
      }
      return { type: "vector", samples: [...groups.values()].map((g) => ({ labels: g.labels, value: g.n })) };
    }

    const groups = new Map<string, { labels: Labels; members: Sample[] }>();
    for (const s of input) {
      const gl = groupLabels(s.labels);
      const k = labelsKey(gl);
      if (!groups.has(k)) groups.set(k, { labels: gl, members: [] });
      groups.get(k)!.members.push(s);
    }

    if (e.op === "topk" || e.op === "bottomk") {
      const kf = (param as { value: number }).value;
      if (Number.isNaN(kf)) throw new PromQLError("Parameter value is NaN");
      const k = Math.min(Math.floor(kf), Number.MAX_SAFE_INTEGER);
      if (k < 1) return { type: "vector", samples: [] };
      const out: Sample[] = [];
      for (const g of groups.values()) {
        const sorted = [...g.members].sort((a, b) => {
          const av = a.value, bv = b.value;
          if (Number.isNaN(av)) return 1;
          if (Number.isNaN(bv)) return -1;
          return e.op === "topk" ? bv - av : av - bv;
        });
        out.push(...sorted.slice(0, k).map((s) => ({ labels: s.labels, value: s.value })));
      }
      return { type: "vector", samples: out };
    }

    const out: Sample[] = [];
    for (const g of groups.values()) {
      const vals = g.members.map((s) => s.value);
      out.push({ labels: g.labels, value: aggValue(e.op, vals, param ? (param as { value: number }).value : 0) });
    }
    return { type: "vector", samples: out };
  }

  // ---------- Binary operators ----------

  private binary(e: Extract<Expr, { kind: "binary" }>, t: number): Value {
    const l = this.evalAt(e.lhs, t), r = this.evalAt(e.rhs, t);
    if (l.type === "scalar" && r.type === "scalar") {
      const [v, keep] = elemOp(e.op, l.value, r.value);
      return { type: "scalar", value: COMPARISON.has(e.op) ? (keep ? 1 : 0) : v };
    }
    if (l.type === "vector" && r.type === "vector") {
      const m = e.matching!;
      if (SET_OPS.has(e.op)) return { type: "vector", samples: this.setOp(e.op, l.samples, r.samples, m) };
      return { type: "vector", samples: this.checkDuplicates(this.vectorBinop(e.op, l.samples, r.samples, m, e.bool)) };
    }
    // vector-scalar
    const vecLeft = l.type === "vector";
    const vec = (vecLeft ? l : r) as { samples: Sample[] };
    const sc = (vecLeft ? r : l) as { value: number };
    const out: Sample[] = [];
    const drop = e.bool || !COMPARISON.has(e.op);
    for (const s of vec.samples) {
      const [lv, rv] = vecLeft ? [s.value, sc.value] : [sc.value, s.value];
      let [v, keep] = elemOp(e.op, lv, rv);
      if (COMPARISON.has(e.op) && !vecLeft) v = s.value; // keep the vector's value even when it's on the right
      if (e.bool) { v = keep ? 1 : 0; keep = true; }
      if (!keep) continue;
      out.push({ labels: drop ? dropName(s.labels) : s.labels, value: v });
    }
    return { type: "vector", samples: this.checkDuplicates(out) };
  }

  private sig(m: VectorMatching) {
    return (l: Labels) => {
      if (m.on) return m.labels.map((k) => `${k}\u0000${l[k] ?? ""}`).join("\u0001");
      return Object.keys(l).filter((k) => k !== NAME && !m.labels.includes(k)).sort().map((k) => `${k}\u0000${l[k]}`).join("\u0001");
    };
  }

  private setOp(op: BinOp, lhs: Sample[], rhs: Sample[], m: VectorMatching): Sample[] {
    const sig = this.sig(m);
    if (op === "and") {
      const rs = new Set(rhs.map((s) => sig(s.labels)));
      return lhs.filter((s) => rs.has(sig(s.labels))).map((s) => ({ labels: s.labels, value: s.value }));
    }
    if (op === "unless") {
      const rs = new Set(rhs.map((s) => sig(s.labels)));
      return lhs.filter((s) => !rs.has(sig(s.labels))).map((s) => ({ labels: s.labels, value: s.value }));
    }
    const ls = new Set(lhs.map((s) => sig(s.labels)));
    return [...lhs.map((s) => ({ labels: s.labels, value: s.value })), ...rhs.filter((s) => !ls.has(sig(s.labels))).map((s) => ({ labels: s.labels, value: s.value }))];
  }

  private vectorBinop(op: BinOp, lhsIn: Sample[], rhsIn: Sample[], m: VectorMatching, returnBool: boolean): Sample[] {
    if (!lhsIn.length || !rhsIn.length) return [];
    const swap = m.card === "one-to-many";
    const [lhs, rhs] = swap ? [rhsIn, lhsIn] : [lhsIn, rhsIn];
    const sig = this.sig(m);
    const right = new Map<string, Sample>();
    for (const rs of rhs) {
      const k = sig(rs.labels);
      const dup = right.get(k);
      if (dup) {
        const side = swap ? "left" : "right";
        throw new PromQLError(`found duplicate series for the match group on the ${side} hand-side of the operation: [${formatLabels(rs.labels)}, ${formatLabels(dup.labels)}]; many-to-many matching not allowed: matching labels must be unique on one side`);
      }
      right.set(k, rs);
    }
    const matchedOneToOne = new Set<string>();
    const matchedGroup = new Map<string, Set<string>>();
    const out: Sample[] = [];
    const dropForSchema = !COMPARISON.has(op); // arithmetic changes the metric's meaning
    for (const ls of lhs) {
      const k = sig(ls.labels);
      const rs = right.get(k);
      if (!rs) continue;
      let [fl, fr] = [ls.value, rs.value];
      if (swap) [fl, fr] = [fr, fl];
      let [v, keep] = elemOp(op, fl, fr);
      if (returnBool) { v = keep ? 1 : 0; }
      // Result labels.
      let lb: Labels = { ...ls.labels };
      if (returnBool || dropForSchema) lb = dropName(lb);
      if (m.card === "one-to-one") {
        if (m.on) { const kept: Labels = {}; for (const n of m.labels) if (lb[n] !== undefined) kept[n] = lb[n]; lb = kept; }
        else for (const n of m.labels) delete lb[n];
      }
      for (const n of m.include) { const val = rs.labels[n]; if (val) lb[n] = val; else delete lb[n]; }
      if (m.card === "one-to-one") {
        if (matchedOneToOne.has(k)) throw new PromQLError("multiple matches for labels: many-to-one matching must be explicit (group_left/group_right)");
        matchedOneToOne.add(k);
      } else {
        const set = matchedGroup.get(k) ?? new Set<string>();
        const rk = labelsKey(lb);
        if (set.has(rk)) throw new PromQLError("multiple matches for labels: grouping labels must ensure unique matches");
        set.add(rk);
        matchedGroup.set(k, set);
      }
      if (!keep && !returnBool) continue;
      out.push({ labels: lb, value: v });
    }
    return out;
  }

  // ---------- Functions ----------

  private call(e: Extract<Expr, { kind: "call" }>, t: number): Value {
    const f = e.func;
    const vec = (samples: Sample[]): Value => ({ type: "vector", samples });
    const simple = (fn: (x: number) => number): Value =>
      vec(this.checkDuplicates(this.vectorArg(e.args[0], t).map((s) => ({ labels: dropName(s.labels), value: fn(s.value) }))));
    switch (f) {
      case "abs": return simple(Math.abs);
      case "ceil": return simple(Math.ceil);
      case "floor": return simple(Math.floor);
      case "exp": return simple(Math.exp);
      case "sqrt": return simple(Math.sqrt);
      case "ln": return simple(Math.log);
      case "log2": return simple(Math.log2);
      case "log10": return simple(Math.log10);
      case "sgn": return simple((x) => (x > 0 ? 1 : x < 0 ? -1 : x));
      case "round": {
        const to = e.args[1] ? this.scalarArg(e.args[1], t) : 1;
        const inv = 1 / to;
        return simple((x) => Math.floor(x * inv + 0.5) / inv);
      }
      case "clamp": {
        const min = this.scalarArg(e.args[1], t), max = this.scalarArg(e.args[2], t);
        if (max < min) return vec([]);
        return simple((x) => Math.max(min, Math.min(max, x)));
      }
      case "clamp_min": { const min = this.scalarArg(e.args[1], t); return simple((x) => Math.max(min, x)); }
      case "clamp_max": { const max = this.scalarArg(e.args[1], t); return simple((x) => Math.min(max, x)); }
      case "time": return { type: "scalar", value: t / 1000 };
      case "pi": return { type: "scalar", value: Math.PI };
      case "vector": return vec([{ labels: {}, value: this.scalarArg(e.args[0], t) }]);
      case "scalar": {
        const v = this.vectorArg(e.args[0], t);
        return { type: "scalar", value: v.length === 1 ? v[0].value : NaN };
      }
      case "timestamp": {
        const arg = unparen(e.args[0]);
        const v = this.vectorArg(e.args[0], t);
        const direct = arg.kind === "vectorSelector";
        return vec(this.checkDuplicates(v.map((s) => ({ labels: dropName(s.labels), value: (direct && s.ts !== undefined ? s.ts : t) / 1000 }))));
      }
      case "sort": case "sort_desc": {
        const v = this.vectorArg(e.args[0], t).map((s) => ({ labels: s.labels, value: s.value }));
        const dir = f === "sort" ? 1 : -1;
        return vec(v.sort((a, b) => (Number.isNaN(a.value) ? 1 : Number.isNaN(b.value) ? -1 : dir * (a.value - b.value))));
      }
      case "label_replace": {
        const [dst, repl, src, re] = [1, 2, 3, 4].map((i) => this.stringArg(e.args[i], t));
        let rx: RegExp;
        try { rx = new RegExp(`^(?:${re})$`, "s"); } catch { throw new PromQLError(`invalid regular expression in label_replace(): ${re}`); }
        if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(dst)) throw new PromQLError(`invalid destination label name in label_replace(): ${dst}`);
        const out = this.vectorArg(e.args[0], t).map((s) => {
          const m = rx.exec(s.labels[src] ?? "");
          if (!m) return { labels: s.labels, value: s.value };
          const val = expandGo(repl, m);
          const lb = { ...s.labels };
          if (val) lb[dst] = val; else delete lb[dst];
          return { labels: lb, value: s.value };
        });
        return vec(this.checkDuplicates(out));
      }
      case "label_join": {
        const dst = this.stringArg(e.args[1], t), sep = this.stringArg(e.args[2], t);
        const srcs = e.args.slice(3).map((a) => this.stringArg(a, t));
        if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(dst)) throw new PromQLError(`invalid destination label name in label_join(): ${dst}`);
        const out = this.vectorArg(e.args[0], t).map((s) => {
          const val = srcs.map((n) => s.labels[n] ?? "").join(sep);
          const lb = { ...s.labels };
          if (val) lb[dst] = val; else delete lb[dst];
          return { labels: lb, value: s.value };
        });
        return vec(this.checkDuplicates(out));
      }
      case "absent": {
        const v = this.vectorArg(e.args[0], t);
        if (v.length) return vec([]);
        return vec([{ labels: absentLabels(unparen(e.args[0])), value: 1 }]);
      }
      case "histogram_quantile": {
        const q = this.scalarArg(e.args[0], t);
        const groups = new Map<string, { labels: Labels; buckets: { upper: number; count: number }[] }>();
        for (const s of this.vectorArg(e.args[1], t)) {
          const le = s.labels.le;
          if (le === undefined) continue;
          const upper = le === "+Inf" ? Infinity : Number(le);
          if (Number.isNaN(upper) && le !== "NaN") continue;
          const { le: _le, [NAME]: _n, ...rest } = s.labels;
          const k = labelsKey(rest);
          if (!groups.has(k)) groups.set(k, { labels: rest, buckets: [] });
          groups.get(k)!.buckets.push({ upper, count: s.value });
        }
        return vec([...groups.values()].map((g) => ({ labels: g.labels, value: bucketQuantile(q, g.buckets) })));
      }
      case "day_of_week": case "day_of_month": case "day_of_year": case "days_in_month":
      case "hour": case "minute": case "month": case "year": {
        const input = e.args[0] ? this.vectorArg(e.args[0], t) : [{ labels: {}, value: t / 1000 }];
        const fn = (x: number) => dateFn(f, x);
        return vec(this.checkDuplicates(input.map((s) => ({ labels: dropName(s.labels), value: fn(s.value) }))));
      }
    }

    // Range-vector functions.
    const qArg = f === "quantile_over_time" ? this.scalarArg(e.args[0], t) : 0;
    const mArgExpr = f === "quantile_over_time" ? e.args[1] : e.args[0];
    const mv = this.evalAt(mArgExpr, t);
    if (mv.type !== "matrix") throw new PromQLError(`${f}() expects a range vector.`);
    if (f === "absent_over_time") {
      if (mv.series.length) return vec([]);
      const inner = unparen(mArgExpr);
      return vec([{ labels: inner.kind === "matrixSelector" ? absentLabels(inner.selector) : {}, value: 1 }]);
    }
    const rangeMs = rangeOf(mArgExpr);
    const te = windowEnd(mArgExpr, t, this.start, this.end);
    const keepName = f === "last_over_time";
    const out: Sample[] = [];
    for (const s of mv.series) {
      const pts = s.points;
      let v: number | null = null;
      switch (f) {
        case "rate": v = extrapolatedRate(pts, te - rangeMs, te, rangeMs, true, true); break;
        case "increase": v = extrapolatedRate(pts, te - rangeMs, te, rangeMs, true, false); break;
        case "delta": v = extrapolatedRate(pts, te - rangeMs, te, rangeMs, false, false); break;
        case "irate": case "idelta": {
          if (pts.length < 2) break;
          const a = pts[pts.length - 2], b = pts[pts.length - 1];
          let d = b.v - a.v;
          if (f === "irate" && b.v < a.v) d = b.v; // counter reset
          v = f === "irate" ? (b.t === a.t ? null : d / ((b.t - a.t) / 1000)) : d;
          break;
        }
        case "deriv": if (pts.length >= 2) v = linearRegression(pts, pts[0].t)[0]; break;
        case "predict_linear": {
          if (pts.length < 2) break;
          const dur = this.scalarArg(e.args[1], t);
          const [slope, icpt] = linearRegression(pts, t);
          v = slope * dur + icpt;
          break;
        }
        case "resets": { let n = 0; for (let i = 1; i < pts.length; i++) if (pts[i].v < pts[i - 1].v) n++; v = n; break; }
        case "changes": {
          let n = 0;
          for (let i = 1; i < pts.length; i++) { const a = pts[i - 1].v, b = pts[i].v; if (a !== b && !(Number.isNaN(a) && Number.isNaN(b))) n++; }
          v = n; break;
        }
        case "avg_over_time": v = kahanSum(pts.map((p) => p.v)) / pts.length; break;
        case "sum_over_time": v = kahanSum(pts.map((p) => p.v)); break;
        case "min_over_time": v = pts.reduce((m, p) => (p.v < m || Number.isNaN(m) ? p.v : m), pts[0].v); break;
        case "max_over_time": v = pts.reduce((m, p) => (p.v > m || Number.isNaN(m) ? p.v : m), pts[0].v); break;
        case "count_over_time": v = pts.length; break;
        case "last_over_time": v = pts[pts.length - 1].v; break;
        case "present_over_time": v = 1; break;
        case "stddev_over_time": v = Math.sqrt(popVariance(pts.map((p) => p.v))); break;
        case "stdvar_over_time": v = popVariance(pts.map((p) => p.v)); break;
        case "quantile_over_time": v = quantile(qArg, pts.map((p) => p.v)); break;
        default: throw new PromQLError(`The function ${f}() isn't supported in this playground.`);
      }
      if (v === null) continue;
      out.push({ labels: keepName ? s.labels : dropName(s.labels), value: v });
    }
    return vec(this.checkDuplicates(out));
  }
}

function aggValue(op: AggOp, vals: number[], param: number): number {
  switch (op) {
    case "sum": return kahanSum(vals);
    case "avg": return kahanSum(vals) / vals.length;
    case "count": return vals.length;
    case "group": return 1;
    case "min": return vals.reduce((m, v) => (v < m || Number.isNaN(m) ? v : m), vals[0]);
    case "max": return vals.reduce((m, v) => (v > m || Number.isNaN(m) ? v : m), vals[0]);
    case "stddev": return Math.sqrt(popVariance(vals));
    case "stdvar": return popVariance(vals);
    case "quantile": return quantile(param, vals);
    default: throw new PromQLError(`Unsupported aggregation ${op}`);
  }
}

function elemOp(op: BinOp, l: number, r: number): [number, boolean] {
  switch (op) {
    case "+": return [l + r, true];
    case "-": return [l - r, true];
    case "*": return [l * r, true];
    case "/": return [l / r, true];
    case "%": return [goMod(l, r), true];
    case "^": return [Math.pow(l, r), true];
    case "atan2": return [Math.atan2(l, r), true];
    case "==": return [l, l === r];
    case "!=": return [l, l !== r];
    case ">": return [l, l > r];
    case "<": return [l, l < r];
    case ">=": return [l, l >= r];
    case "<=": return [l, l <= r];
    default: throw new PromQLError(`Operator ${op} isn't valid here.`);
  }
}

/** Go's math.Mod: result has the sign of the dividend. JS % matches for finite values. */
const goMod = (a: number, b: number) => a % b;

function unparen(e: Expr): Expr { return e.kind === "paren" ? unparen(e.expr) : e; }

function rangeOf(e: Expr): number {
  const u = unparen(e);
  if (u.kind === "matrixSelector") return u.rangeMs;
  if (u.kind === "subquery") return u.rangeMs;
  return 0;
}

function windowEnd(e: Expr, t: number, start: number, end: number): number {
  const u = unparen(e);
  const at = u.kind === "matrixSelector" ? u.selector.at : u.kind === "subquery" ? u.at : null;
  const off = u.kind === "matrixSelector" ? u.selector.offsetMs : u.kind === "subquery" ? u.offsetMs : 0;
  const base = !at ? t : at.kind === "start" ? start : at.kind === "end" ? end : at.t;
  return base - off;
}

function extrapolatedRate(pts: Point[], rangeStart: number, rangeEnd: number, rangeMs: number, isCounter: boolean, isRate: boolean): number | null {
  if (pts.length < 2) return null;
  const first = pts[0], last = pts[pts.length - 1];
  let result = last.v - first.v;
  if (isCounter) for (let i = 1; i < pts.length; i++) if (pts[i].v < pts[i - 1].v) result += pts[i - 1].v;
  let durationToStart = (first.t - rangeStart) / 1000;
  let durationToEnd = (rangeEnd - last.t) / 1000;
  const sampledInterval = (last.t - first.t) / 1000;
  const avg = sampledInterval / (pts.length - 1);
  const threshold = avg * 1.1;
  if (durationToStart >= threshold) durationToStart = avg / 2;
  if (isCounter) {
    let durationToZero = durationToStart;
    if (result > 0 && first.v >= 0) durationToZero = sampledInterval * (first.v / result);
    if (durationToZero < durationToStart) durationToStart = durationToZero;
  }
  if (durationToEnd >= threshold) durationToEnd = avg / 2;
  let factor = sampledInterval !== 0 ? (sampledInterval + durationToStart + durationToEnd) / sampledInterval : 1;
  if (isRate) factor /= rangeMs / 1000;
  return result * factor;
}

function absentLabels(e: Expr): Labels {
  if (e.kind !== "vectorSelector") return {};
  const out: Labels = {};
  const seen = new Set<string>();
  for (const m of e.matchers) {
    if (m.name === NAME) continue;
    if (m.type === "=" && !seen.has(m.name)) { out[m.name] = m.value; seen.add(m.name); }
    else if (seen.has(m.name)) delete out[m.name];
  }
  return out;
}

/** Go regexp.Expand semantics for $1, ${1}, $name and $$. */
function expandGo(template: string, m: RegExpExecArray): string {
  return template.replace(/\$(\$|\{([a-zA-Z0-9_]+)\}|([a-zA-Z0-9_]+))/g, (_, all: string, braced?: string, bare?: string) => {
    if (all === "$") return "$";
    const name = braced ?? bare!;
    if (/^\d+$/.test(name)) return m[Number(name)] ?? "";
    return m.groups?.[name] ?? "";
  });
}

function dateFn(f: string, secs: number): number {
  if (!Number.isFinite(secs)) return NaN;
  const d = new Date(Math.floor(secs) * 1000);
  switch (f) {
    case "day_of_week": return d.getUTCDay();
    case "day_of_month": return d.getUTCDate();
    case "day_of_year": return Math.floor((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86_400_000) + 1;
    case "days_in_month": return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    case "hour": return d.getUTCHours();
    case "minute": return d.getUTCMinutes();
    case "month": return d.getUTCMonth() + 1;
    case "year": return d.getUTCFullYear();
  }
  return NaN;
}
