# PCA exam bank audit

## Scope and method

- **What was audited:** `exam/{observability,fundamentals,promql,instrumentation,alerting}.json`, 187 questions. All are single-answer with four options.
- **Ground truth:** the same local doc clones as the practice audit, plus the Pushgateway README.

**The files were being rewritten while I audited them.** Option texts changed at 19:04, 19:06, 19:08:22 and 19:08:49 UTC, mostly to even out option lengths.

- I waited until the files had been unchanged for 90 seconds, then took a snapshot at 19:10 UTC.
- I re-read every question in that snapshot. All findings, ids and statistics below refer to it.
- The length statistics are shown both before and after the rewrite.

**Checks performed:**

- Every answer key and every per-option note was checked against the docs.
- Every source URL resolves to an existing local doc file. Most sources are page-level, with no `#anchor`.
- The duplicate check compared each exam question with all 303 practice questions in `topics/*/questions.json`. Similarity combined the stem text, the option words and the correct option text.

## Summary

| Severity | Count |
|---|---|
| **Critical** | 0 |
| **Major** | 4 (one of them is a group of 23 near-duplicate questions) |
| **Minor** | 14 |

**Answer keys are sound.**

- I found no question whose keyed answer is wrong.
- Defaults and semantics are all correct: scrape interval 1m and timeout 10s, lookback 5m, retention 15d, Alertmanager timers 30s/5m/4h, rate, irate, increase, histogram_quantile, vector matching and precedence.
- Pushgateway facts match the README: the grouping key, PUT vs POST, no TTL, and `honor_labels`.
- Prometheus 3.x is handled correctly: Content-Type scrape failure, UTF-8 quoting, native histograms, opt-in auto-reload in `x-cf-reload`, and `/query` vs `/graph`.

**The biggest exam-realism problem is overlap with the practice bank.** 23 exam questions closely paraphrase a practice question, and several have identical stems. A learner who has drilled the practice bank will recognise these, which inflates mock scores.

### Option length (computed)

| Snapshot | Correct option is strictly the longest | Mean length ratio (correct ÷ mean of the wrong options) |
|---|---|---|
| Before the rewrite (first read, about 19:00) | 97 of 187 (52%) | 1.68 (median 1.23) |
| Final snapshot (19:10) | 41 of 187 (22%) | 1.00 (median 1.04) |

Before the rewrite, the correct option was clearly a giveaway. In promql, instrumentation and alerting the mean ratio was about 2.1.

In the final snapshot, being the longest is now no more likely for the correct option than chance (25% for four options). The correct option is strictly the shortest in 40 of 187 (21%). Only 5 questions have a ratio of at least 1.3.

**Per file, final snapshot:**

| File | Questions | Mean ratio | Correct is strictly longest | Correct is strictly shortest |
|---|---|---|---|---|
| observability | 33 | 0.93 | 2 | **15 (45%)** |
| fundamentals | 37 | 1.02 | 13 | 8 |
| promql | 55 | 1.06 | 17 | 3 |
| instrumentation | 28 | 0.93 | 3 | 9 (32%) |
| alerting | 34 | 1.02 | 6 | 5 |

The overall length bias is gone, but **observability now leans the other way**: there, the shortest option is correct 45% of the time (see minor finding m1).

### Answer position

The correct option is `a` in all 187 questions. This doesn't leak in mocks: `lib/services/exams.ts` (`toPublic`) shuffles option order for each attempt. Any other consumer of the raw JSON (exports, a future review screen, or the practice pipeline if the bank is ever reused) would leak the answer, so this is minor finding m2.

## Findings

### Major

#### M1. Near-verbatim duplicates of practice questions (23)

Each exam question below has a near-identical stem, or the same scenario with the same correct answer, as the practice question it's paired with.

| Exam id | Practice id | Note |
|---|---|---|
| `x-cf-defaults` | `cfg-default-interval` | Same stem, same four options |
| `x-ip-batch` | `in-batch-key` | Identical stem |
| `x-sl-slo` | `slo-slo` | Identical stem |
| `x-dm-identity` | `dm-identity` | |
| `x-db-browser` | `db-browser` | |
| `x-pt-timestamp` | `ts-timestamp-fn` | |
| `x-pt-time` | `ts-time-def` | |
| `x-pt-uptime` | `ts-uptime` | |
| `x-ar-group-seq` | `ar-group` | |
| `x-ar-keep-firing` | `ar-keep-firing` | |
| `x-ar-promtool` | `ar-promtool` | |
| `x-ab-metamon` | `ab-meta` | |
| `x-pr-rate-def` | `rate-what` | |
| `x-pr-irate-use` | `irate-use` | |
| `x-pr-deriv` | `deriv-gauge` | |
| `x-pr-changes` | `resets-changes` | |
| `x-om-untyped` | `exp-no-type` | |
| `x-om-sample` | `dm-sample` | |
| `x-ie-node` | `ex-node` | |
| `x-pad-count-values` | `ag-count-values` | |
| `x-pat-quantile` | `ot-quantile` | |
| `x-pat-max` | `ag-quantile-vs-over-time` | |
| `x-db-rate-graph` | `db-raw-counter` | |

Further same-scenario pairs that a manual read found below the automatic threshold:

| Exam id | Practice id | Note |
|---|---|---|
| `x-tr-status` | `tr-status` | Same scenario, same four options |
| `x-ps-empty-matcher` | `sel-illegal` | Same correct option `{job=~".*"}` |
| `x-pp-pgw-forget` | `pp-stale-forever` | |
| `x-ph-avg` | `hist-avg` | |
| `x-ef-om-eof` | `exp-om-eof` | |
| `x-li-billing` | `lim-billing` | |
| `x-dm-empty` | `dm-empty-label` | |

**Evidence.** The similarity scan (`dups.py`, threshold score ≥0.6, or stem ≥0.75 together with correct-option ≥0.55) flagged 23 pairs.

**Fix.** Rewrite each pair as an applied scenario that tests the same fact from another angle. For example:

- `x-cf-defaults`: show a config with `scrape_interval` set only on job B and ask about job A.
- `x-sl-slo`: give a sentence and ask whether it describes an SLI, SLO or SLA.
- `x-tr-status`: ask what a span that ended with an exception should be set to.

Start with the identical-stem items.

#### M2. `promql.json`, `x-pad-sort` option c note

The option reads "Grafana strips PromQL functions" (keyed wrong). Its note reads **"It does."**

That note was written for the earlier text, "Grafana doesn't support PromQL functions". After the rewrite, it now confirms a false statement.

**Fix.** Change the note to "It doesn't. Grafana sends the query unchanged. Range queries simply ignore sort order."

#### M3. `promql.json`, `x-pbi-on`

The stem gives the left vector labels `{instance, job, mode}` and asks how to divide "matching only on instance". The keyed answer is `a / on(instance) b`.

- A `mode` label usually means several left series per instance, as with `node_cpu_seconds_total`.
- In that case, one-to-one `on(instance)` fails with a many-to-one matching error, and `group_left` is needed.
- The note concedes this ("provided each side has one series per instance"), but the stem doesn't say so.

**Evidence.** `prom/querying/operators.md`: many-to-one matching "must be explicitly requested using the `group_left` or `group_right` modifiers".

**Fix.** Choose one:

- Add "Each side has exactly one series per instance" to the stem.
- Better: change the key to `a / on(instance) group_left b` and make the plain `on(instance)` form a distractor. That's a stronger exam item.

#### M4. Observability file: the shortest option is now the giveaway

After the rewrite, the correct option is strictly the shortest in 15 of 33 observability questions (45%). Examples:

| Question | Correct option | Competing options |
|---|---|---|
| `x-om-sample` | "A float64 value and a millisecond timestamp" | Wrong options are longer |
| `x-sd-file` | `file_sd_configs` pointed at the files | Wrong options are longer |
| `x-tr-span-def` | "One operation within a request" | Wrong options are longer |
| `x-tr-root`, `x-sl-sli`, `x-sl-slo` | Shortest option | |

Instrumentation is at 32%.

**Fix.** Trim the padded wrong options, such as "…across the API servers", "…for the month" and "…for each sample", so that lengths vary randomly in both directions.

### Minor

| # | Id(s) | Issue | Evidence | Fix |
|---|---|---|---|---|
| m1 | observability (see M4) | Reverse length bias. Listed here only as a cross-reference. | Computed | See M4 |
| m2 | all 187 | The correct option is always `a`. It's safe only because `exams.ts` shuffles at display. | `lib/services/exams.ts` `toPublic` | Randomise `correct` ids in the source, or add a validator check |
| m3 | `x-ar-promtool` option d | Note says `promtool test metrics` is "for checking metrics", but that command doesn't exist. The real commands are `promtool check metrics` and `promtool test rules`. | `prom/command-line/promtool.md`: only `test rules` under `promtool test` | Note: "No such command. Metrics are checked with `promtool check metrics`." |
| m4 | `x-in-units` option d | Note says "Gauges and durations don't take _total". Duration *counters* do, for example `process_cpu_seconds_total`. | `docs/practices/naming.md`: "process_cpu_seconds_total (for an accumulating count with unit)" | "A duration histogram or gauge doesn't take _total, and the unit should be seconds." |
| m5 | `x-ar-group-seq` option a | "Sequentially, at the same time" reads as a contradiction. The docs mean the same evaluation *timestamp*. | `prom/configuration/recording_rules.md`: "run sequentially at a regular interval, with the same evaluation time" | "Sequentially, using the same evaluation timestamp" |
| m6 | `x-ie-up-metric` option b note | "Stop serving /metrics … can't tell exporter failure from database failure" ignores that returning a 5xx is one of the two documented patterns. | `docs/instrumenting/writing_exporters.md`: "The first is to return a 5xx error." | "Possible (a 5xx is a documented pattern), but `mysql_up` is better because other metrics stay available." |
| m7 | `x-in-single-unit` option d | "Missing a namespace prefix" is also true of `request_size_and_duration`. The note concedes it. It's a single best answer, but it invites argument. | `docs/practices/naming.md` | Rename the example to `myapp_request_size_and_duration` |
| m8 | `x-cl-exemplar`, `x-tr-exemplar` | Explanations call exemplars an OpenMetrics feature. The protobuf format carries them too. | `docs/instrumenting/exposition_formats.md`, protobuf row: "Exemplars" | "OpenMetrics (or protobuf)" |
| m9 | `x-ie-blackbox` | The note's protocol list omits gRPC; this is my own knowledge. The cited `writing_exporters` page doesn't describe blackbox probes at all. | Source mismatch | Cite `docs/instrumenting/exporters.md` or the blackbox_exporter repo, and add gRPC |
| m10 | `x-sl-error-budget`, `x-db-red` | The cited source doesn't support the claim. The OTel primer doesn't define error budget, and the Zen only links RED without expanding the acronym. | `otel/observability-primer.md`; `docs/practices/the_zen.md` line 19 | Mark as general knowledge, or cite a supporting source |
| m11 | `x-om-sample` | After the rewrite, option a drops "or a native histogram". It's still the best answer but no longer the full definition. | `docs/concepts/data_model.md`: "a float64 or native histogram value" | "A float64 (or native histogram) value and a ms timestamp" |
| m12 | `x-cl-official` (b COBOL, c Fortran), `x-ab-slack` (b "post alerts to Slack"), `x-fa-api` (c `/graphql`), `x-db-red` (b–d invented acronyms), `x-li-billing` (b "values >1,000"), `x-dm-colon` (d "names over 20 chars"), `x-ef-om-eof` (d "A checksum") | Joke or trivially eliminated distractors, which turn these into 2- or 3-option items. | Not applicable | Use real misconceptions: C#/.NET and PHP (third-party) for the official-library question, `/api/v2` for the API path, and for RED a set like "Rate, Errors, Duration" vs "Utilisation, Saturation, Errors" (USE) vs latency/traffic/errors/saturation (golden signals) |
| m13 | `x-ph-apdex`, `x-pad-sort`, `x-pp-put-post`, `x-li-float` | Lower-probability trivia for a PCA mock: Apdex arithmetic, Grafana sort behaviour, Pushgateway HTTP verbs, 2^53. | Not applicable | Keep, but weight them out of the 60-question mock, or replace with core items |
| m14 | `x-pt-clamp`, `x-pt-vector`, `x-pt-absent` (topic `promql-timestamps`); `x-pbi-scalar` (`promql-binary`) | Topic tags don't fit. `clamp`, `vector(0)` and `absent` aren't timestamp topics. This skews per-topic diagnostics. | Not applicable | Retag, for example to `promql-agg-dimensions` or `promql-agg-time` |

### Other observations

- **Boilerplate notes:** 92 of 187 correct-option notes read just "This is the correct answer." They give no reasoning, which is weak for post-mock review. Replace them with a one-line reason.
- **Pool size vs blueprint (17/12/11/11/9):**

  | Domain | Pool | Per mock | Repeats start after |
  |---|---|---|---|
  | promql | 55 | 17 | about 3 mocks |
  | fundamentals | 37 | 12 | about 3 mocks |
  | alerting | 34 | 11 | about 3 mocks |
  | observability | 33 | 11 | about 3 mocks |
  | instrumentation | 28 | 9 | about 3 mocks |

  `obs-logs-events` has only 3 questions in the pool. Repeats start after about 3 mocks plus the pre-course check.

- **Sources:** all 41 distinct URLs resolve to local docs (`github.com/prometheus/pushgateway#readme` → `pushgateway/README.md`). Almost all are page-level with no anchor. That isn't wrong, but anchors such as `functions/#rate` would make post-mock review faster.
