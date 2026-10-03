/** Typed PromQL expression tree for the playground engine. */
import { FUNCTIONS } from "./functions-meta";

export type MatchType = "=" | "!=" | "=~" | "!~";
export type Matcher = { name: string; type: MatchType; value: string };

export type ValueType = "scalar" | "vector" | "matrix" | "string";

export type AtSpec = { kind: "time"; t: number } | { kind: "start" } | { kind: "end" } | null;

export type Expr =
  | { kind: "number"; value: number }
  | { kind: "string"; value: string }
  | { kind: "paren"; expr: Expr }
  | { kind: "unary"; op: "-" | "+"; expr: Expr }
  | { kind: "vectorSelector"; name: string | null; matchers: Matcher[]; offsetMs: number; at: AtSpec }
  | { kind: "matrixSelector"; selector: Extract<Expr, { kind: "vectorSelector" }>; rangeMs: number }
  | { kind: "subquery"; expr: Expr; rangeMs: number; stepMs: number | null; offsetMs: number; at: AtSpec }
  | { kind: "call"; func: string; args: Expr[] }
  | { kind: "aggregate"; op: AggOp; param: Expr | null; grouping: string[]; without: boolean; expr: Expr }
  | { kind: "binary"; op: BinOp; lhs: Expr; rhs: Expr; bool: boolean; matching: VectorMatching | null };

export type AggOp = "sum" | "avg" | "min" | "max" | "count" | "group" | "stddev" | "stdvar" | "topk" | "bottomk" | "quantile" | "count_values";

export type BinOp = "+" | "-" | "*" | "/" | "%" | "^" | "atan2" | "==" | "!=" | ">" | "<" | ">=" | "<=" | "and" | "or" | "unless";

export type VectorMatching = {
  on: boolean; // true = on(...), false = ignoring(...)
  labels: string[];
  card: "one-to-one" | "many-to-one" | "one-to-many" | "many-to-many";
  include: string[];
};

export const COMPARISON: ReadonlySet<BinOp> = new Set(["==", "!=", ">", "<", ">=", "<="]);
export const SET_OPS: ReadonlySet<BinOp> = new Set(["and", "or", "unless"]);

export class PromQLError extends Error {
  constructor(message: string, public from?: number, public to?: number) {
    super(message);
  }
}

/** Static result type of an expression (mirrors parser type checking). */
export function typeOf(e: Expr): ValueType {
  switch (e.kind) {
    case "number": return "scalar";
    case "string": return "string";
    case "paren": return typeOf(e.expr);
    case "unary": return typeOf(e.expr);
    case "vectorSelector": return "vector";
    case "matrixSelector": return "matrix";
    case "subquery": return "matrix";
    case "aggregate": return "vector";
    case "call": return FUNCTIONS[e.func]?.returns ?? "vector";
    case "binary": return typeOf(e.lhs) === "scalar" && typeOf(e.rhs) === "scalar" ? "scalar" : "vector";
  }
}
