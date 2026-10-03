/**
 * Guided PromQL tasks for the playground. A task is solved when the learner's
 * query returns the same series and values as the reference query at every
 * check time (minutes relative to the end of the sample data).
 */
import { PromQLError } from "./ast";
import { Engine, formatLabels, labelsKey, type Sample, type Value } from "./engine";
import { DATA_END } from "./dataset";

export type Challenge = {
  id: string;
  topic: string;
  title: string;
  prompt: string;
  reference: string;
  hint: string;
  doc: { url: string; title: string };
  checkAtMin?: number[];
};

const P = "https://prometheus.io/docs/prometheus/latest/querying/";
const HIST = { url: "https://prometheus.io/docs/practices/histograms/", title: "Histograms and summaries" };

export const CHALLENGES: Challenge[] = [
  { id: "sel-down", topic: "promql-selecting", title: "Find down targets", prompt: "Return every target whose last scrape failed. Check it at -80m, when api-3 was restarting.", reference: "up == 0", hint: "up is 1 for healthy targets and 0 for failed scrapes. A comparison filters.", doc: { url: P + "basics/", title: "Querying basics" }, checkAtMin: [-80.25, 0] },
  { id: "sel-5xx", topic: "promql-selecting", title: "Select server errors", prompt: "Select the http_requests_total series for the api job with any 5xx status.", reference: 'http_requests_total{job="api", status=~"5.."}', hint: "Use a regex matcher with =~. It's anchored, so 5.. means exactly three characters starting with 5.", doc: { url: P + "basics/#instant-vector-selectors", title: "Instant vector selectors" } },
  { id: "sel-offset", topic: "promql-selecting", title: "Look back an hour", prompt: "Show node_load1 as it was one hour before the evaluation time.", reference: "node_load1 offset 1h", hint: "The offset modifier shifts a selector back in time.", doc: { url: P + "basics/#offset-modifier", title: "offset modifier" } },
  { id: "rate-basic", topic: "promql-rates", title: "Requests per second", prompt: "Per-second rate of every http_requests_total series, averaged over the last 5 minutes.", reference: "rate(http_requests_total[5m])", hint: "rate() takes a range vector: add [5m] to the selector.", doc: { url: P + "functions/#rate", title: "rate()" } },
  { id: "rate-increase", topic: "promql-rates", title: "Requests in the last hour", prompt: "Total requests served in the last hour, per instance.", reference: "sum by (instance) (increase(http_requests_total[1h]))", hint: "increase() gives the change over a range; sum it by instance afterwards.", doc: { url: P + "functions/#increase", title: "increase()" } },
  { id: "rate-resets", topic: "promql-rates", title: "Spot a restart", prompt: "Return the process_cpu_seconds_total series that had at least one counter reset in the last 3 hours.", reference: "resets(process_cpu_seconds_total[3h]) > 0", hint: "resets() counts decreases in a counter over a range.", doc: { url: P + "functions/#resets", title: "resets()" } },
  { id: "rate-predict", topic: "promql-rates", title: "Disk full soon?", prompt: "Return filesystems predicted to run out of space within 4 hours, based on the last hour.", reference: "predict_linear(node_filesystem_avail_bytes[1h], 4 * 3600) < 0", hint: "predict_linear(range, seconds) extrapolates a gauge. Compare the prediction with 0.", doc: { url: P + "functions/#predict_linear", title: "predict_linear()" } },
  { id: "agt-max", topic: "promql-agg-time", title: "Peak queue depth", prompt: "The highest email queue depth seen in the last 30 minutes.", reference: 'max_over_time(queue_depth{queue="email"}[30m])', hint: "_over_time functions aggregate each series across a range.", doc: { url: P + "functions/#aggregation_over_time", title: "<aggregation>_over_time()" } },
  { id: "agt-subquery", topic: "promql-agg-time", title: "Worst 5 minutes", prompt: "For api-2's 500 errors, the highest 5-minute rate reached during the last hour, sampled every minute.", reference: 'max_over_time(rate(http_requests_total{instance="api-2:8080", status="500"}[5m])[1h:1m])', hint: "Wrap the rate in a subquery: rate(...)[1h:1m], then take max_over_time.", doc: { url: P + "basics/#subquery", title: "Subqueries" } },
  { id: "agd-byjob", topic: "promql-agg-dimensions", title: "Rate per job", prompt: "Total request rate (5m) per job, with every other label removed.", reference: "sum by (job) (rate(http_requests_total[5m]))", hint: "rate first, then sum by (job).", doc: { url: P + "operators/#aggregation-operators", title: "Aggregation operators" } },
  { id: "agd-topk", topic: "promql-agg-dimensions", title: "Busiest paths", prompt: "The 2 paths with the highest total request rate (5m) across all instances.", reference: "topk(2, sum by (path) (rate(http_requests_total[5m])))", hint: "Sum by path first, then topk(2, ...).", doc: { url: P + "operators/#aggregation-operators", title: "topk" } },
  { id: "agd-count", topic: "promql-agg-dimensions", title: "Targets per job", prompt: "How many targets each job has.", reference: "count by (job) (up)", hint: "Every target has exactly one up series.", doc: { url: P + "operators/#aggregation-operators", title: "count" } },
  { id: "bin-ratio", topic: "promql-binary", title: "Error ratio", prompt: "The fraction of requests that returned a 5xx status, per instance, over 5 minutes.", reference: 'sum by (instance) (rate(http_requests_total{status=~"5.."}[5m])) / sum by (instance) (rate(http_requests_total[5m]))', hint: "Divide two sums that have the same by (instance) labels so they match one-to-one.", doc: { url: P + "operators/#vector-matching", title: "Vector matching" }, checkAtMin: [-43, 0] },
  { id: "bin-mem", topic: "promql-binary", title: "Memory used", prompt: "Memory in use on each node as a ratio from 0 to 1.", reference: "1 - node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes", hint: "Available divided by total is the free share. Subtract it from 1.", doc: { url: P + "operators/#arithmetic-binary-operators", title: "Arithmetic operators" } },
  { id: "bin-groupleft", topic: "promql-binary", title: "Rate with version", prompt: "Request rate per instance (5m), with the version label from app_build_info added.", reference: "sum by (instance) (rate(http_requests_total[5m])) * on(instance) group_left(version) app_build_info", hint: "Multiply by the info metric (value 1), matching on(instance), and copy version with group_left(version).", doc: { url: P + "operators/#many-to-one-and-one-to-many-vector-matches", title: "group_left" }, checkAtMin: [-43, 0] },
  { id: "hist-p95", topic: "promql-histograms", title: "95th percentile latency", prompt: "95th percentile request latency across all api instances and paths, over 5 minutes.", reference: "histogram_quantile(0.95, sum by (le) (rate(http_request_duration_seconds_bucket[5m])))", hint: "rate the _bucket series, sum by (le), then histogram_quantile(0.95, ...).", doc: { url: P + "functions/#histogram_quantile", title: "histogram_quantile()" }, checkAtMin: [-43, 0] },
  { id: "hist-avg", topic: "promql-histograms", title: "Average latency", prompt: "Average request latency per path over 5 minutes.", reference: "sum by (path) (rate(http_request_duration_seconds_sum[5m])) / sum by (path) (rate(http_request_duration_seconds_count[5m]))", hint: "Rate of _sum divided by rate of _count, each summed by path.", doc: HIST },
  { id: "hist-fraction", topic: "promql-histograms", title: "Within 250 ms", prompt: "The fraction of all requests served within 250 ms, over 5 minutes.", reference: 'sum(rate(http_request_duration_seconds_bucket{le="0.25"}[5m])) / sum(rate(http_request_duration_seconds_count[5m]))', hint: "Good events divided by all events: the le=\"0.25\" bucket over _count.", doc: HIST, checkAtMin: [-43, 0] },
  { id: "ts-since", topic: "promql-timestamps", title: "Time since success", prompt: "Seconds since each batch job last succeeded.", reference: "time() - batch_job_last_success_timestamp_seconds", hint: "The metric holds a Unix timestamp; subtract it from time().", doc: { url: P + "functions/#time", title: "time()" } },
  { id: "ts-stale", topic: "promql-timestamps", title: "Stale batch jobs", prompt: "Batch jobs that haven't succeeded in more than a day.", reference: "time() - batch_job_last_success_timestamp_seconds > 86400", hint: "A day is 86400 seconds.", doc: { url: "https://prometheus.io/docs/practices/alerting/#batch-jobs", title: "Alerting on batch jobs" } },
  { id: "ts-uptime", topic: "promql-timestamps", title: "Process uptime", prompt: "Uptime in seconds of each api process.", reference: "time() - process_start_time_seconds", hint: "process_start_time_seconds is when the process started.", doc: { url: P + "functions/#time", title: "time()" } },
];

export type CheckResult = { solved: true } | { solved: false; message: string };

function toSamples(v: Value): Sample[] | null {
  if (v.type === "vector") return v.samples;
  return null;
}

export function checkChallenge(engine: Engine, c: Challenge, query: string): CheckResult {
  for (const m of c.checkAtMin ?? [0, -43]) {
    const t = DATA_END + m * 60_000;
    const when = m === 0 ? "at the end of the data" : `at ${m}m`;
    let got: Value;
    try { got = engine.instantQuery(query, t); } catch (e) { return { solved: false, message: e instanceof PromQLError ? e.message : String(e) }; }
    const want = engine.instantQuery(c.reference, t);
    if (got.type !== want.type) return { solved: false, message: `Your query returns ${got.type === "scalar" ? "a single number" : got.type === "matrix" ? "a range vector" : `a ${got.type}`}, but this task needs ${want.type === "vector" ? "an instant vector (a set of series)" : `a ${want.type}`}.` };
    if (want.type === "scalar" && got.type === "scalar") { if (!close(got.value, want.value)) return { solved: false, message: `Close, but the value differs ${when}.` }; continue; }
    const g = toSamples(got)!, w = toSamples(want)!;
    const gl = new Set(g.flatMap((s) => Object.keys(s.labels))), wl = new Set(w.flatMap((s) => Object.keys(s.labels)));
    const extra = [...gl].filter((l) => !wl.has(l)), missing = [...wl].filter((l) => !gl.has(l));
    if (g.length && w.length && extra.length === 1 && extra[0] === "__name__") return { solved: false, message: "Your result still has the metric name, so it's raw data rather than computed. Is a function or operator missing?" };
    if (g.length && w.length && extra.length) return { solved: false, message: `Your series still have labels the answer doesn't (${extra.filter((l) => l !== "__name__").join(", ")}). Do you need to aggregate them away?` };
    if (g.length && w.length && missing.length) return { solved: false, message: `Your series are missing labels the answer keeps (${missing.join(", ")}).` };
    if (g.length !== w.length) return { solved: false, message: `${when[0].toUpperCase() + when.slice(1)}, your query returns ${g.length} series; the answer has ${w.length}.` };
    const wm = new Map(w.map((s) => [labelsKey(s.labels), s.value]));
    for (const s of g) {
      const k = labelsKey(s.labels);
      if (!wm.has(k)) return { solved: false, message: `Unexpected series ${formatLabels(s.labels)} ${when}.` };
      if (!close(s.value, wm.get(k)!)) return { solved: false, message: `The right series, but values differ ${when} (for example ${formatLabels(s.labels)}). Check the range, function or operator.` };
    }
  }
  return { solved: true };
}

function close(a: number, b: number) {
  if (Number.isNaN(a) || Number.isNaN(b)) return Number.isNaN(a) && Number.isNaN(b);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return a === b;
  return Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
}
