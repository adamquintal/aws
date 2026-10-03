# PCA track: technical accuracy audit

Scope: `track.json`, 26 `lesson.mdx` files and 303 questions in `topics/*/questions.json`. Every lesson and every question was read in full, including its options, per-option notes, explanation, hint and sources.

Ground truth came from local clones of the official doc sources, because prometheus.io and opentelemetry.io are blocked by the network proxy:

- `prometheus/docs` (site content), referred to below as `docs/`
- `prometheus/prometheus` docs at version 3.14.0, referred to as `prom/`
- the Alertmanager repo docs, referred to as `am/`
- the OpenTelemetry concepts docs, referred to as `otel/`

Where a finding rests on expert knowledge rather than a doc, it says so.

## Summary

| Severity | Count |
|---|---|
| **Critical** (wrong or ambiguous answer key, or a materially false fact) | 1 |
| **Major** (misleading, outdated, or missing an important caveat) | 3 |
| **Minor** (wording, nit, weak distractor, source anchor) | 17 |

**Overall assessment: very high accuracy.**

- I checked every marked-correct option against the docs. None is factually wrong for the material the exam is based on.
- The checked defaults are all correct:
  - scrape: interval 1m, timeout 10s, evaluation interval 1m
  - storage and queries: lookback 5m, retention 15d, two-hour blocks
  - Alertmanager: group_wait 30s, group_interval 5m, repeat_interval 4h
  - HTTP SD refresh: 60s
- Function semantics are correct for rate, irate, increase, delta, deriv, predict_linear, the `_over_time` family, absent, histogram_quantile, offset and @, the aggregation operators, vector matching and precedence.
- Version notes are unusually good. They already cover left-open ranges, UTF-8 names, the Content-Type requirement, `le` normalisation, native histograms becoming stable in 3.8, Alertmanager API v2 only, console templates being unbundled, and first_over_time becoming stable in 3.14.
- A script resolved all 76 distinct source URLs to local doc files and checked every `#anchor`. Only one anchor is broken.

The remaining issues come almost entirely from **Prometheus 3.x changes made after the content was written**. Three are the important ones:

- Retention has moved into the config file, and the CLI flag is now deprecated.
- `--config.auto-reload` now exists.
- Prometheus can now receive pushed metrics directly through OTLP and remote-write receivers.

**Topics with the most issues:**

| Topic | Findings |
|---|---|
| `fund-config-scraping` | 1 critical, 2 major, 1 minor |
| `fund-exposition` | 2 minor |
| `obs-push-pull` | 1 major |
| `obs-slos` | 2 minor, source issues |
| `promql-binary` | 2 minor |

## Findings

### Critical

#### C1. `fund-config-scraping/questions.json`, `cfg-flags-vs-file`

**What's wrong.**

- The stem asks: "Which setting belongs in a command-line flag rather than in prometheus.yml?"
- The keyed answer is "How long to retain data on disk".
- In current Prometheus 3.x, retention is a config-file field, `storage.tsdb.retention.time` / `.size`, and the CLI flags are marked DEPRECATED.
- A candidate who reads the current docs could reasonably say retention belongs in prometheus.yml. That leaves no option that is unambiguously flag-only.
- The docs are themselves inconsistent: the configuration page intro still says flags configure the "amount of data to keep on disk". That is why the answer key is ambiguous rather than simply wrong.

**Evidence.**

- `prom/command-line/prometheus.md` line 39: "[DEPRECATED] … This flag has been deprecated, use the storage.tsdb.retention.time field in the config file instead."
- `prom/configuration/configuration.md` line ~4226: "This option takes precedence over the deprecated command-line flag --storage.tsdb.retention.time."
- The 3.11.0 CHANGELOG has bugfixes for retention set in the config file.

**Suggested fix.**

- Replace option (a) with a setting that is still flag-only: "Where the TSDB stores its data (`--storage.tsdb.path`)" or "The address the web UI listens on (`--web.listen-address`)".
- Optionally add to the note: "Retention moved to `storage.tsdb.retention` in the config file in recent 3.x. The flag still works but is deprecated."

### Major

#### M1. `fund-config-scraping/lesson.mdx` and `fund-limitations/lesson.mdx`: retention described as flag-only

**Where.**

- `fund-config-scraping`: the first keyPoint and the "Flags vs. the config file" section.
- `fund-limitations`: the keyPoint "Default retention is 15 days (--storage.tsdb.retention.time)" and section 3.

**What's wrong.** Both lessons present retention as an immutable flag parameter with no 3.x caveat. That's now outdated, as shown in C1.

**Evidence.** `prom/command-line/prometheus.md` line 39–40: "This flag has been deprecated, use the storage.tsdb.retention.time field in the config file instead."

**Suggested fix.** Add a versionNote to both lessons:

> In recent Prometheus 3.x, retention is set under `storage: tsdb: retention: {time, size}` in prometheus.yml. It's reloadable, and the `--storage.tsdb.retention.*` flags are deprecated. The default is still 15d. Exam-era material uses the flags.

Change "flags set … retention" to "flags set … the storage path (and, in older versions, retention)".

#### M2. `fund-config-scraping/questions.json`, `cfg-reload` option c and note; lesson section "Reloading"

**What's wrong.**

- Option c says: "Editing the file. Prometheus watches it and reloads automatically". It is keyed wrong, and its note says "Prometheus doesn't automatically reload prometheus.yml when it changes."
- Since 3.0 (feature flag) and 3.12 (stable), `--config.auto-reload` does exactly that.
- The key is right only for the default configuration. In a "select all" question, a well-read candidate may tick c.

**Evidence.**

- `prom/command-line/prometheus.md` line 15: "`--config.auto-reload` | Enable automatic configuration file reloading. … | `false`"
- CHANGELOG 3.12.0: "Promote auto-reload-config as stable".

**Suggested fix.**

- Reword option c to "By default, editing the file is enough, because Prometheus watches it and reloads automatically".
- Change the note to: "Not by default. Since 3.x you can opt in with `--config.auto-reload` (checks every 30s)."
- Add one sentence to the lesson's Reloading section.

#### M3. `obs-push-pull/lesson.mdx` and `questions.json`, `pp-model` option b note

**Where.** The lesson's first keyPoint, "Pushing is supported only through an intermediary, the Pushgateway", and the `pp-model` note "Pushing is only supported through an intermediary, the Pushgateway, and only for limited cases."

**What's wrong.** Prometheus 3.x can accept pushed metrics directly through `--web.enable-otlp-receiver` (OTLP over HTTP) and `--web.enable-remote-write-receiver`. "Only through the Pushgateway" is no longer true.

The answer key of `pp-model` ("normally… pulls") stays correct.

**Evidence.**

- `docs/guides/opentelemetry.md` line 6: "Prometheus supports OTLP (aka "OpenTelemetry Protocol") ingestion through HTTP."
- `prom/command-line/prometheus.md` lines 31 and 33: the `--web.enable-remote-write-receiver` and `--web.enable-otlp-receiver` flags, both default `false`.

**Suggested fix.**

- Change the keyPoint to: "Pull is the default model. For classic exposition, pushing goes through the Pushgateway. Prometheus 3.x can also receive pushed OTLP and remote-write data when you enable those receivers (off by default)."
- Update the `pp-model` note to match.
- Add a versionNote.

### Minor

| # | File | Question / section | What's wrong | Evidence | Suggested fix |
|---|---|---|---|---|---|
| m1 | `obs-slos/lesson.mdx` + `questions.json` | lesson sources; `slo-sli`, `slo-slo`, `slo-sla`, `slo-strict`, `slo-good-sli`, `slo-budget` | Broken anchor `observability-primer/#reliability--metrics`. The heading is "Reliability and metrics". `obs-logs-events` uses the correct anchor. | `otel/observability-primer.md` line 26: "## Reliability and metrics" | Change to `#reliability-and-metrics` (7 occurrences) |
| m2 | `obs-slos/questions.json` | `slo-sla`, `slo-strict`, `slo-budget` | The only cited source (OTel primer) defines SLI and SLO but not SLA or error budget. The explanations disclose this, but the source still doesn't support the claim. | `otel/observability-primer.md`: defines "SLI" and "SLO" only | Fine to keep with the disclosure. Ideally cite the Zen's SLO link or drop the source, and flag the item `status` accordingly. |
| m3 | `promql-binary/lesson.mdx` | versionNotes | It says the histogram trim operators need feature flags. `</` and `>/` shipped in 3.11 with no flag documented; only fill modifiers are flagged. | `prom/querying/operators.md`: "Fill modifiers are **experimental** and must be enabled with `--enable-feature=promql-binop-fill-modifiers`." The trim section names no flag. | "Fill modifiers need a feature flag. Histogram trim operators (`</`, `>/`, 3.11+) work only on native histograms." |
| m4 | `promql-binary/questions.json` | `bin-on-vs-ignoring` option d note | "Both work with arithmetic and comparison operators" is incomplete. `on` and `ignoring` also work with the set operators `and`, `or` and `unless`. | `prom/querying/operators.md`, vector matching applies to "operations between two instant vectors" | "Both work with arithmetic, comparison and set operators." |
| m5 | `fund-exposition/lesson.mdx` | keyPoint "The plain text format uses Content-Type text/plain; version=0.0.4" and the formats table | 3.x also negotiates `text/plain; version=1.0.0`, Prometheus text 1.0.0 with UTF-8 escaping. The `exp-content-type` key is still fine. | `docs/instrumenting/content_negotiation.md` line 40: "PrometheusText1.0.0 | text/plain | version=1.0.0" | Add: "Prometheus 3.x also understands text/plain;version=1.0.0, which adds UTF-8 names." |
| m6 | `fund-exposition/lesson.mdx` | formats table, Protobuf row | "Needed for native histograms" is overstated. Classic histograms can be converted to NHCB (`convert_classic_histograms_to_nhcb`), and OpenMetrics 2.0 (experimental) is coming. | `prom/configuration/configuration.md` line 155: `convert_classic_histograms_to_nhcb`. `prom/feature_flags.md` line 358: "OpenMetrics 2.0 support is **experimental**." | "The usual way to scrape exponential native histograms" |
| m7 | `fund-limitations/questions.json` | `lim-retention` explanation | It names `--storage.tsdb.retention.time` and `.size` without noting that they're deprecated in favour of the config file. The answer (15d) is correct. | Same as C1 | Add "(or `storage.tsdb.retention` in prometheus.yml on recent 3.x)" |
| m8 | `fund-config-scraping/lesson.mdx` | relabeling actions table and keyPoint | It omits `lowercase`, `uppercase`, `keepequal` and `dropequal`. "Include" makes this not false, but a candidate may meet them. | `prom/configuration/configuration.md` lines 3663–3668 list all four | Add one row: "`lowercase`/`uppercase`, `keepequal`/`dropequal`: less common" |
| m9 | `alert-dashboarding/lesson.mdx` + `questions.json` | expression browser at `/graph`; `db-browser` | The 3.x getting-started guide uses `http://localhost:9090/query`. `browser.md` still says `/graph`, so the docs are inconsistent. | `prom/getting_started.md` line 82: "http://localhost:9090/query and choose the "Graph" tab" | "At `/query` in the 3.x UI (`/graph` in 2.x)" |
| m10 | `promql-selecting/lesson.mdx` + `questions.json` | staleness/lookback; `sel-lookback` option c note | The note "Instant selectors … don't interpolate" ignores the `smoothed` and `anchored` modifiers. Their feature flag became a no-op, so they're enabled by default. | `prom/feature_flags.md` line 312–313: "flag is now a no-op. The `anchored` and `smoothed` modifiers are enabled by default." | A versionNote: "Newer 3.x adds `anchored`/`smoothed` range-selector modifiers. Plain selectors still don't interpolate." |
| m11 | `promql-histograms/lesson.mdx` | versionNotes | It doesn't mention NHCB (classic buckets stored as one native-histogram series), which the current docs push hard. | `docs/practices/histograms.md`: "If you can, ingest classic histograms as NHCB." | Add a one-line versionNote |
| m12 | `obs-service-discovery/lesson.mdx` | mechanisms table, `ec2_sd_configs` | A unified `aws_sd_configs` (roles ec2, ecs, rds…) now exists alongside it. Not wrong. | `prom/configuration/configuration.md` line 871: "### `<aws_sd_config>` … unified service discovery … through the `role` parameter" | Add "(newer: `aws_sd_configs` with `role: ec2`)" |
| m13 | `obs-tracing` lesson, `tr-exemplar` | exemplars described as an OpenMetrics feature | The protobuf format also carries exemplars. | `docs/instrumenting/exposition_formats.md` line 233: protobuf "Supported advanced features: … Exemplars" | "In the OpenMetrics (or protobuf) format" |
| m14 | `instr-exporters/lesson.mdx` | Blackbox row "HTTP, DNS, TCP or ICMP" | It omits gRPC. This is expert knowledge: the blackbox_exporter supports a `grpc` prober; not in the local docs. | Expert knowledge | "HTTP(S), DNS, TCP, ICMP and gRPC" |
| m15 | `fund-limitations`, `lim-utc` | "UTC for display in all components" | The FAQ wording is accurate, but expert knowledge says the Prometheus UI has long offered a "use local time" display toggle, so the 3.x UI can show local time. Low risk. | `docs/introduction/faq.md` line 135–138 (UTC rationale). Toggle is expert knowledge. | Optional note: "The UI can optionally display local time. Storage and PromQL are always UTC." |
| m16 | several | duplicate questions across topics | Near-identical items inflate mastery counts: `in-batch-key`≈`ts-batch-key`, `in-logging`≈`le-count`, `lim-logs`≈`le-prom-logs`, `hist-fraction-no-bucket`≈`slo-no-bucket`, `hist-fraction`≈`slo-ratio`, `arch-notifications`≈`ar-who-notifies`, `arch-recording-rule`≈`ar-recording-why`. | Not applicable (content review) | Vary the angle of one in each pair, for example a scenario instead of a recall stem |
| m17 | several | weak distractors and exam-unrealistic trivia | **Trivially eliminated options:** `lim-utc` c/d ("CNCF requires it", "scrapes only at midnight"), `le-correlate` b/d ("upper case", "removing timestamps"), `nm-labels-in-name` b/d, `ts-why-timestamp` c/d, `slo-sla` d, `ab-meta` c, `tr-span` b/c, `arch-recording-rule` c. **Trivia unlikely to be examined:** keyPoint "Grafana 2.5.0 (2015)", "12–17 ns", "285 years" (`lim-float`), `db-grafana-port` and `db-consoles` (Grafana/3.0 trivia), `ar-keep-firing` (post-curriculum, 2.42). | Not applicable | Replace with plausible misconceptions, for example `lim-utc`: "Because PromQL's time() can't handle offsets". Keep the trivia but mark it lower priority or difficulty, rather than core. |

## Under-covered or missing PCA curriculum areas

All 26 curriculum items map 1:1 to a topic. Within them, these commonly examined areas get little or no coverage:

1. **`label_replace()` / `label_join()`**: zero mentions. These are frequently examined PromQL functions.
2. **Utility PromQL functions**: `vector()`, `scalar()`, `sort()`/`sort_desc()`, `clamp*()`, `abs()`, `round()`, `ceil()`/`floor()` are absent, apart from `vector(time())` in the date functions.
3. **Federation**: mentioned only in passing (honor_labels, external_labels). Not covered: the `/federate` endpoint, `match[]` params, or hierarchical vs cross-service federation.
4. **Prometheus Agent mode** (`--agent`, remote-write-only): not covered. It's a relevant architecture and limitations topic.
5. **HTTP API**: not covered (`/api/v1/query`, `/api/v1/query_range`, `/api/v1/targets`), nor the management endpoints (`/-/healthy`, `/-/ready`; only `/-/reload` appears).
6. **Automatically generated scrape series** other than `up`: `scrape_samples_scraped`, `scrape_samples_post_metric_relabeling`, `scrape_series_added`, `scrape_duration_seconds` (`docs/concepts/jobs_instances.md`). Scrape limits such as `sample_limit` are also absent.
7. **Pushgateway mechanics**: the grouping key (`/metrics/job/<job>/instance/…`), push vs PUT/POST/DELETE semantics, and `push_time_seconds`.
8. **Alertmanager extras**: notification templates, `time_intervals` / `mute_time_intervals` / `active_time_intervals`, `resolve_timeout` (5m), the webhook receiver payload, and silences via the v2 API.
9. **Native histogram functions**: `histogram_count()`, `histogram_sum()`, `histogram_avg()` and `histogram_fraction()`. Only the last appears, and only in obs-slos.
10. **Relabel recipes**: `hashmod` sharding, rewriting `__address__` ports, and `__param_target` for the blackbox exporter (described in prose only).
