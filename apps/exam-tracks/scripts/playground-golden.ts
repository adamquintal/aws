// Record real Prometheus results for the golden query suite.
//
//   npx tsx scripts/playground-export.ts /tmp/playground.om
//   promtool tsdb create-blocks-from openmetrics /tmp/playground.om /tmp/ptsdb
//   prometheus --storage.tsdb.path=/tmp/ptsdb --storage.tsdb.retention.time=100y --web.listen-address=127.0.0.1:9099
//   PROM_URL=http://127.0.0.1:9099 npx tsx scripts/playground-golden.ts
//
// Writes tests/fixtures/promql-golden.json, which tests/playground-golden.test.ts
// compares the playground engine against.
import fs from "node:fs";
import { DATA_END } from "../lib/promql/dataset";
import { INSTANT_QUERIES, INSTANT_TIMES_MIN, RANGE_QUERIES } from "../tests/promql-golden-queries";

const URL_BASE = process.env.PROM_URL ?? "http://127.0.0.1:9099";

async function api(path: string, params: Record<string, string>) {
  const res = await fetch(`${URL_BASE}${path}`, { method: "POST", body: new URLSearchParams(params) });
  return (await res.json()) as { status: string; data?: { resultType: string; result: unknown }; error?: string; errorType?: string };
}

async function main() {
  const version = await (await fetch(`${URL_BASE}/api/v1/status/buildinfo`)).json();
  const instant = [];
  for (const q of INSTANT_QUERIES) {
    for (const m of INSTANT_TIMES_MIN) {
      const time = (DATA_END + m * 60_000) / 1000;
      const r = await api("/api/v1/query", { query: q, time: String(time) });
      instant.push({ query: q, time, status: r.status, resultType: r.data?.resultType, result: r.data?.result, error: r.error });
    }
  }
  const range = [];
  for (const [q, s, e, step] of RANGE_QUERIES) {
    const start = (DATA_END + s * 60_000) / 1000, end = (DATA_END + e * 60_000) / 1000;
    const r = await api("/api/v1/query_range", { query: q, start: String(start), end: String(end), step: String(step) });
    range.push({ query: q, start, end, step, status: r.status, result: r.data?.result, error: r.error });
  }
  fs.mkdirSync("tests/fixtures", { recursive: true });
  fs.writeFileSync("tests/fixtures/promql-golden.json", JSON.stringify({ prometheus: version.data?.version, dataEnd: DATA_END, instant, range }, null, 1));
  console.log(`recorded ${instant.length} instant and ${range.length} range results from Prometheus ${version.data?.version}`);
}
main();
