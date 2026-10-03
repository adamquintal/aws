/**
 * PromQL parsing: the official Prometheus grammar (@prometheus-io/lezer-promql)
 * produces the syntax tree; this module converts it into the typed AST and runs
 * the same type checks Prometheus does, with friendly error messages.
 */
import { parser } from "@prometheus-io/lezer-promql";
import type { SyntaxNode } from "@lezer/common";
import { COMPARISON, PromQLError, SET_OPS, typeOf, type AggOp, type AtSpec, type BinOp, type Expr, type Matcher, type ValueType, type VectorMatching } from "./ast";
import { FUNCTIONS } from "./functions-meta";

const UNITS: Record<string, number> = { ms: 1, s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000, w: 604_800_000, y: 31_536_000_000 };

export function parseDuration(text: string): number {
  if (text.startsWith("-")) return -parseDuration(text.slice(1));
  if (/^\d+(\.\d+)?$/.test(text)) return Math.round(parseFloat(text) * 1000); // plain seconds (3.x)
  const re = /(\d+)(ms|s|m|h|d|w|y)/g;
  let total = 0, consumed = 0, m: RegExpExecArray | null;
  while ((m = re.exec(text))) { total += Number(m[1]) * UNITS[m[2]]; consumed += m[0].length; }
  if (!consumed || consumed !== text.length) throw new PromQLError(`invalid duration "${text}"`);
  return total;
}

function parseNumber(text: string): number {
  const t = text.toLowerCase();
  if (t === "inf" || t === "+inf") return Infinity;
  if (t === "-inf") return -Infinity;
  if (t === "nan") return NaN;
  if (/^0x[0-9a-f]+$/.test(t)) return parseInt(t, 16);
  if (/^[0-9]+(ms|s|m|h|d|w|y)/.test(t)) return parseDuration(t) / 1000; // durations as numbers (seconds)
  const n = Number(text);
  if (Number.isNaN(n)) throw new PromQLError(`invalid number "${text}"`);
  return n;
}

function unquote(raw: string): string {
  const q = raw[0];
  const body = raw.slice(1, -1);
  if (q === "`") return body;
  return body.replace(/\\(u[0-9a-fA-F]{4}|U[0-9a-fA-F]{8}|x[0-9a-fA-F]{2}|[0-7]{3}|.)/g, (_, e: string) => {
    switch (e[0]) {
      case "n": return "\n";
      case "t": return "\t";
      case "r": return "\r";
      case "a": return "\x07";
      case "b": return "\b";
      case "f": return "\f";
      case "v": return "\v";
      case "u": case "U": return String.fromCodePoint(parseInt(e.slice(1), 16));
      case "x": return String.fromCharCode(parseInt(e.slice(1), 16));
      default: return /^[0-7]{3}$/.test(e) ? String.fromCharCode(parseInt(e, 8)) : e;
    }
  });
}

const BIN_OPS: Record<string, BinOp> = {
  Add: "+", Sub: "-", Mul: "*", Div: "/", Mod: "%", Pow: "^", Atan2: "atan2",
  Eql: "==", Neq: "!=", Gtr: ">", Lss: "<", Gte: ">=", Lte: "<=", And: "and", Or: "or", Unless: "unless",
};

const AGG_OPS: Record<string, AggOp> = {
  Sum: "sum", Avg: "avg", Min: "min", Max: "max", Count: "count", Group: "group", Stddev: "stddev", Stdvar: "stdvar",
  Topk: "topk", Bottomk: "bottomk", Quantile: "quantile", CountValues: "count_values",
};

export function parse(query: string): Expr {
  const src = query;
  if (!src.trim()) throw new PromQLError("Type a query to run.");
  const tree = parser.parse(src);
  let err: SyntaxNode | null = null;
  tree.iterate({ enter: (n) => { if (!err && n.type.isError) { err = n.node; return false; } } });
  if (err) {
    const e = err as SyntaxNode;
    const near = src.slice(e.from, Math.max(e.to, e.from + 1)).trim();
    throw new PromQLError(near ? `Syntax error near "${near}" (position ${e.from + 1}).` : `Syntax error: the query looks unfinished (position ${e.from + 1}).`, e.from, e.to);
  }
  const top = tree.topNode.firstChild;
  if (!top) throw new PromQLError("Type a query to run.");
  const expr = convert(top, src);
  check(expr);
  return expr;
}

const text = (n: SyntaxNode, src: string) => src.slice(n.from, n.to);
const kids = (n: SyntaxNode) => { const out: SyntaxNode[] = []; for (let c = n.firstChild; c; c = c.nextSibling) if (c.name !== "LineComment") out.push(c); return out; };

function unsupported(what: string, n: SyntaxNode): never {
  throw new PromQLError(`${what} isn't supported in this playground.`, n.from, n.to);
}

function convert(n: SyntaxNode, src: string): Expr {
  switch (n.name) {
    case "NumberDurationLiteral":
      return { kind: "number", value: parseNumber(text(n, src)) };
    case "StringLiteral":
      return { kind: "string", value: unquote(text(n, src)) };
    case "ParenExpr": {
      const inner = kids(n)[0];
      return { kind: "paren", expr: convert(inner, src) };
    }
    case "UnaryExpr": {
      const [op, e] = kids(n);
      return { kind: "unary", op: text(op, src) as "-" | "+", expr: convert(e, src) };
    }
    case "VectorSelector":
      return vectorSelector(n, src);
    case "MatrixSelector": {
      const [vs, dur] = kids(n);
      const sel = convert(vs, src);
      if (sel.kind !== "vectorSelector") throw new PromQLError("Ranges like [5m] can only follow a series selector. Use a subquery such as [1h:1m] for expressions.", n.from, n.to);
      if (sel.offsetMs || sel.at) throw new PromQLError("Put offset and @ after the range, e.g. x[5m] offset 1h.", n.from, n.to);
      return { kind: "matrixSelector", selector: sel, rangeMs: parseDuration(text(dur, src)) };
    }
    case "SubqueryExpr": {
      const [e, range, step] = kids(n);
      return { kind: "subquery", expr: convert(e, src), rangeMs: parseDuration(text(range, src)), stepMs: step ? parseDuration(text(step, src)) : null, offsetMs: 0, at: null };
    }
    case "OffsetExpr": {
      const c = kids(n);
      const target = convert(c[0], src);
      const neg = c.some((k) => k.name === "Sub");
      const ms = parseDuration(text(c[c.length - 1], src)) * (neg ? -1 : 1);
      return applyModifier(target, { offsetMs: ms }, n);
    }
    case "StepInvariantExpr": {
      const c = kids(n);
      const target = convert(c[0], src);
      const atNode = c[c.length - 1];
      let at: AtSpec;
      if (atNode.name === "AtModifierPreprocessors") at = { kind: atNode.firstChild?.name === "AtStart" ? "start" : "end" };
      else {
        const neg = c.some((k) => k.name === "Sub");
        at = { kind: "time", t: Math.round(parseNumber(text(atNode, src)) * 1000) * (neg ? -1 : 1) };
      }
      return applyModifier(target, { at }, n);
    }
    case "AnchoredExpr":
    case "SmoothedExpr":
      return unsupported("The anchored/smoothed modifier", n);
    case "FunctionCall": {
      const [id, body] = kids(n);
      const name = text(id, src);
      if (!FUNCTIONS[name]) unsupported(`The function ${name}()`, id);
      return { kind: "call", func: name, args: body ? kids(body).map((a) => convert(a, src)) : [] };
    }
    case "AggregateExpr": {
      const c = kids(n);
      const opNode = c.find((k) => k.name === "AggregateOp")!;
      const opName = opNode.firstChild!.name;
      const op = AGG_OPS[opName];
      if (!op) unsupported(`The ${text(opNode, src)} aggregation`, opNode);
      const mod = c.find((k) => k.name === "AggregateModifier");
      const body = c.find((k) => k.name === "FunctionCallBody");
      const args = body ? kids(body).map((a) => convert(a, src)) : [];
      const needsParam = op === "topk" || op === "bottomk" || op === "quantile" || op === "count_values";
      if (args.length !== (needsParam ? 2 : 1)) throw new PromQLError(`${op}() expects ${needsParam ? 2 : 1} argument${needsParam ? "s" : ""}.`, n.from, n.to);
      let grouping: string[] = [], without = false;
      if (mod) {
        without = mod.firstChild?.name === "Without";
        const gl = kids(mod).find((k) => k.name === "GroupingLabels");
        grouping = gl ? kids(gl).map((l) => labelName(l, src)) : [];
      }
      return { kind: "aggregate", op, param: needsParam ? args[0] : null, expr: needsParam ? args[1] : args[0], grouping, without };
    }
    case "BinaryExpr": {
      const c = kids(n);
      const lhs = convert(c[0], src);
      const rhs = convert(c[c.length - 1], src);
      const opNode = c[1];
      const op = BIN_OPS[opNode.name];
      if (!op) unsupported(`The ${text(opNode, src)} operator`, opNode);
      const bool = c.some((k) => k.name === "BoolModifier");
      const mm = c.find((k) => k.name === "MatchingModifierClause");
      if (c.some((k) => k.name === "FillModifier")) unsupported("fill() modifiers", n);
      let matching: VectorMatching | null = null;
      if (mm) {
        const mk = kids(mm);
        const on = mk[0].name === "On";
        const groups = mk.filter((k) => k.name === "GroupingLabels");
        const card = mk.some((k) => k.name === "GroupLeft") ? "many-to-one" : mk.some((k) => k.name === "GroupRight") ? "one-to-many" : "one-to-one";
        matching = {
          on,
          labels: groups[0] ? kids(groups[0]).map((l) => labelName(l, src)) : [],
          card,
          include: groups[1] ? kids(groups[1]).map((l) => labelName(l, src)) : [],
        };
      }
      return { kind: "binary", op, lhs, rhs, bool, matching };
    }
    default:
      throw new PromQLError(`Unexpected "${text(n, src)}" (position ${n.from + 1}).`, n.from, n.to);
  }
}

function labelName(n: SyntaxNode, src: string) {
  return n.name === "StringLiteral" || n.name === "QuotedLabelName" ? unquote(text(n.name === "QuotedLabelName" ? n.firstChild! : n, src)) : text(n, src);
}

function vectorSelector(n: SyntaxNode, src: string): Expr {
  let name: string | null = null;
  const matchers: Matcher[] = [];
  for (const c of kids(n)) {
    if (c.name === "Identifier" || c.name === "MetricName") name = text(c, src);
    if (c.name === "LabelMatchers") {
      for (const m of kids(c)) {
        if (m.name === "QuotedLabelName") { name = unquote(text(m.firstChild!, src)); continue; }
        const mk = kids(m);
        const ln = labelName(mk[0], src);
        const op = text(mk[1], src) as Matcher["type"];
        const value = unquote(text(mk[2], src));
        if (op === "=~" || op === "!~") {
          try { new RegExp(`^(?:${value})$`); } catch { throw new PromQLError(`Invalid regular expression "${value}".`, m.from, m.to); }
        }
        matchers.push({ name: ln, type: op, value });
      }
    }
  }
  if (name !== null) matchers.unshift({ name: "__name__", type: "=", value: name });
  if (!matchers.some((m) => !matchesEmpty(m)))
    throw new PromQLError("A selector needs a metric name or at least one label matcher that doesn't match the empty string, e.g. {job=~\".+\"} rather than {job=~\".*\"}.", n.from, n.to);
  return { kind: "vectorSelector", name, matchers: matchers.filter((m) => !(m.name === "__name__" && m.type === "=" && m.value === name)), offsetMs: 0, at: null };
}

export function matchesEmpty(m: Matcher): boolean {
  switch (m.type) {
    case "=": return m.value === "";
    case "!=": return m.value !== "";
    case "=~": return new RegExp(`^(?:${m.value})$`).test("");
    case "!~": return !new RegExp(`^(?:${m.value})$`).test("");
  }
}

function applyModifier(target: Expr, mod: { offsetMs?: number; at?: AtSpec }, n: SyntaxNode): Expr {
  // The lezer grammar attaches a trailing modifier to a whole binary expression;
  // Prometheus binds it to the nearest (rightmost) operand, so push it down.
  if (target.kind === "binary") { target.rhs = applyModifier(target.rhs, mod, n); return target; }
  if (target.kind === "unary") { target.expr = applyModifier(target.expr, mod, n); return target; }
  const inner = target.kind === "matrixSelector" ? target.selector : target;
  if (inner.kind !== "vectorSelector" && inner.kind !== "subquery")
    throw new PromQLError(`${mod.at !== undefined ? "@" : "offset"} must follow a series selector, a range like x[5m], or a subquery.`, n.from, n.to);
  if (mod.offsetMs !== undefined) {
    if (inner.offsetMs) throw new PromQLError("offset may only be set once.", n.from, n.to);
    inner.offsetMs = mod.offsetMs;
  }
  if (mod.at !== undefined) {
    if (inner.at) throw new PromQLError("@ may only be set once.", n.from, n.to);
    inner.at = mod.at;
  }
  return target;
}

/** Type checks, mirroring the Prometheus parser's errors. */
function check(e: Expr): void {
  switch (e.kind) {
    case "paren": check(e.expr); return;
    case "unary":
      check(e.expr);
      if (!["scalar", "vector"].includes(typeOf(e.expr))) throw new PromQLError("Unary minus only works on numbers and instant vectors.");
      return;
    case "subquery":
      check(e.expr);
      if (typeOf(e.expr) !== "vector" && typeOf(e.expr) !== "scalar") throw new PromQLError("A subquery needs an instant vector or scalar inside, e.g. rate(x[5m])[1h:1m].");
      return;
    case "matrixSelector": return;
    case "aggregate": {
      check(e.expr);
      if (e.param) check(e.param);
      if (typeOf(e.expr) !== "vector") throw new PromQLError(`${e.op}() needs an instant vector, but got ${article(describe(typeOf(e.expr)))}.${typeOf(e.expr) === "matrix" ? ` Did you mean ${e.op}_over_time()?` : ""}`);
      if (e.op === "count_values" && (!e.param || typeOf(e.param) !== "string")) throw new PromQLError("count_values() needs a label name string first, e.g. count_values(\"version\", x).");
      if ((e.op === "topk" || e.op === "bottomk" || e.op === "quantile") && (!e.param || typeOf(e.param) !== "scalar")) throw new PromQLError(`${e.op}() needs a number first.`);
      return;
    }
    case "call": {
      const meta = FUNCTIONS[e.func];
      e.args.forEach(check);
      const min = meta.args.length - (meta.optional ?? 0);
      if (!meta.variadic && (e.args.length < min || e.args.length > meta.args.length))
        throw new PromQLError(`${e.func}() expects ${meta.optional ? `${min} to ${meta.args.length}` : meta.args.length} argument${meta.args.length === 1 ? "" : "s"}, got ${e.args.length}.`);
      if (meta.variadic && e.args.length < min) throw new PromQLError(`${e.func}() expects at least ${min} arguments.`);
      e.args.forEach((a, i) => {
        const want = meta.args[Math.min(i, meta.args.length - 1)];
        const got = typeOf(a);
        if (got !== want) {
          const hint = want === "matrix" && got === "vector" ? ` Add a range, e.g. ${e.func}(x[5m]).` : want === "vector" && got === "matrix" ? " Remove the [range], or use an _over_time function." : "";
          throw new PromQLError(`${e.func}() expects ${article(describe(want))} as argument ${i + 1}, but got ${article(describe(got))}.${hint}`);
        }
      });
      return;
    }
    case "binary": {
      check(e.lhs); check(e.rhs);
      const lt = typeOf(e.lhs), rt = typeOf(e.rhs);
      if ((lt !== "scalar" && lt !== "vector") || (rt !== "scalar" && rt !== "vector"))
        throw new PromQLError(`Binary operators need numbers or instant vectors on both sides${lt === "matrix" || rt === "matrix" ? "; a range vector like x[5m] has to go through a function such as rate() first" : ""}.`);
      if (SET_OPS.has(e.op) && (lt !== "vector" || rt !== "vector")) throw new PromQLError(`"${e.op}" only works between two instant vectors.`);
      if (e.bool && !COMPARISON.has(e.op)) throw new PromQLError("bool can only be used with comparison operators.");
      if (COMPARISON.has(e.op) && lt === "scalar" && rt === "scalar" && !e.bool) throw new PromQLError("Comparisons between two numbers need the bool modifier, e.g. 1 > bool 0.");
      if (e.matching && (lt !== "vector" || rt !== "vector")) throw new PromQLError("on(), ignoring() and group modifiers need instant vectors on both sides.");
      if (SET_OPS.has(e.op)) {
        if (e.matching && e.matching.card !== "one-to-one") throw new PromQLError("group_left/group_right can't be used with and, or and unless.");
        e.matching = { on: e.matching?.on ?? false, labels: e.matching?.labels ?? [], card: "many-to-many", include: [] };
      } else if (lt === "vector" && rt === "vector" && !e.matching) {
        e.matching = { on: false, labels: [], card: "one-to-one", include: [] };
      }
      return;
    }
    default: return;
  }
}

const describe = (t: ValueType) => ({ scalar: "number", vector: "instant vector", matrix: "range vector", string: "string" })[t];

const article = (w: string) => (/^[aeiou]/.test(w) ? `an ${w}` : `a ${w}`);
