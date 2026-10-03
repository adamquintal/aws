import type { ValueType } from "./ast";

export type FunctionMeta = { args: ValueType[]; optional?: number; variadic?: boolean; returns: ValueType };

const v = "vector" as const, m = "matrix" as const, s = "scalar" as const, str = "string" as const;
const overTime: FunctionMeta = { args: [m], returns: v };
const math1: FunctionMeta = { args: [v], returns: v };
const dateFn: FunctionMeta = { args: [v], optional: 1, returns: v };

/** Functions the playground engine implements (float samples only). */
export const FUNCTIONS: Record<string, FunctionMeta> = {
  abs: math1, ceil: math1, floor: math1, exp: math1, sqrt: math1, ln: math1, log2: math1, log10: math1, sgn: math1,
  round: { args: [v, s], optional: 1, returns: v },
  clamp: { args: [v, s, s], returns: v },
  clamp_min: { args: [v, s], returns: v },
  clamp_max: { args: [v, s], returns: v },
  rate: overTime, irate: overTime, increase: overTime, delta: overTime, idelta: overTime, deriv: overTime,
  resets: overTime, changes: overTime,
  predict_linear: { args: [m, s], returns: v },
  avg_over_time: overTime, min_over_time: overTime, max_over_time: overTime, sum_over_time: overTime,
  count_over_time: overTime, last_over_time: overTime, present_over_time: overTime,
  stddev_over_time: overTime, stdvar_over_time: overTime,
  quantile_over_time: { args: [s, m], returns: v },
  absent: { args: [v], returns: v },
  absent_over_time: overTime,
  time: { args: [], returns: s },
  timestamp: { args: [v], returns: v },
  vector: { args: [s], returns: v },
  scalar: { args: [v], returns: s },
  pi: { args: [], returns: s },
  sort: math1, sort_desc: math1,
  label_replace: { args: [v, str, str, str, str], returns: v },
  label_join: { args: [v, str, str, str], optional: 1, variadic: true, returns: v },
  histogram_quantile: { args: [s, v], returns: v },
  day_of_week: dateFn, day_of_month: dateFn, day_of_year: dateFn, days_in_month: dateFn,
  hour: dateFn, minute: dateFn, month: dateFn, year: dateFn,
};
