# PCA (Prometheus Certified Associate) — Verified Source Map

Compiled 2026-10-03. Facts are paraphrased; short quotes are marked.

## How sources were verified (read this first)

The network egress proxy for this session **blocked** `prometheus.io`, `training.linuxfoundation.org`, `www.cncf.io`, `docs.linuxfoundation.org` and `opentelemetry.io`. GitHub (`github.com`, `raw.githubusercontent.com`, anonymous git clone) was reachable. So:

- **prometheus.io pages were verified by reading their source Markdown** in the official repos that the site is built from. The mapping is defined in `prometheus/docs` → `docs-config.ts` (read directly):
  - `prometheus/docs` repo, `docs/<path>.md` → `https://prometheus.io/docs/<path>/`
  - `prometheus/prometheus` repo, `docs/<path>.md` → `https://prometheus.io/docs/prometheus/latest/<path>/`
  - `prometheus/alertmanager` repo, `docs/<path>.md` → `https://prometheus.io/docs/alerting/latest/<path>/`
  - Clones read: `prometheus/docs` (main), `prometheus/prometheus` (main, VERSION file = 3.14.0, CHANGELOG has unreleased items after 3.14.0), `prometheus/alertmanager` (main, VERSION = 0.34.1).
- **Anchors**: the site uses `rehype-slug` (GitHub-style slugs; checked in `src/components/PromMarkdown.tsx` and `package.json`). Anchors below come from the actual headings using that rule, but I could not load the rendered pages to click-test them. Low-risk anchors (plain words) are listed as-is. One known oddity: the heading `### @ modifier` slugs to `#-modifier` under GitHub-style rules, while older in-doc links use `#modifier`. **Spot-check anchors in a browser before publishing.**
- **LF/CNCF exam pages could not be fetched.** Exam logistics below come from search-result snippets of those official pages (WebSearch limited to training.linuxfoundation.org / cncf.io / docs.linuxfoundation.org). They are marked **UNVERIFIED (snippet only)**.
- The **CNCF curriculum PDF was downloaded and its text extracted** (fully verified).

---

## 1. Exam facts

### 1a. Curriculum (authoritative): CNCF `PCA_Curriculum.pdf` — VERIFIED (high confidence)

- Source: https://github.com/cncf/curriculum/blob/master/PCA_Curriculum.pdf (raw: https://raw.githubusercontent.com/cncf/curriculum/master/PCA_Curriculum.pdf). Downloaded, text extracted with pypdf. sha256 `122ac7efe40f19b319a1807103fc2077b84a69087aae11d81339f93a040a3722`.
- **Last commit touching the file: `8fbb7f2`, 2022-08-31 16:17:04 -0400, Caitriona Mulholland, "PCA Exam Curriculum"**. That is the only commit (checked with `git log` on a blobless clone, and on the GitHub commits page). So the curriculum has not changed since the exam launched in 2022, which was before Prometheus 3.0.
- The PDF has no version number and does not name a target Prometheus version. It does not list question count, duration, passing score, price or retake policy.

Exact domain names, weights and sub-items as printed:

| Weight | Domain (exact text) | Sub-items (exact text) |
|---|---|---|
| 28% | PromQL | Selecting Data · Rates and Derivatives · Aggregating over time · Aggregating over dimensions · Binary operators · Histograms · Timestamp Metrics |
| 20% | Prometheus Fundamentals | System Architecture · Configuration and Scraping · Understanding Prometheus Limitations · Data Model and Labels · Exposition Format |
| 18% | Alerting & Dashboarding | Dashboarding basics · Configuring Alerting rules · Understand and Use Alertmanager · Alerting basics (when, what, and why) |
| 18% | Observability Concepts | Metrics · Understand logs and events · Tracing and Spans · Push vs Pull · Service Discovery · Basics of SLOs, SLAs, and SLIs |
| 16% | Instrumentation and Exporters | Client Libraries · Instrumentation · Exporters · Structuring and naming metrics |

**How it compares with the assumed list:** the domains, weights, sub-items and their order all match. The only differences are in wording:
- "Instrumentation & Exporters" is printed as **"Instrumentation and Exporters"**. (Only "Alerting & Dashboarding" uses an ampersand.)
- Capitalisation: "Configuring Alerting rules", "Understand and Use Alertmanager" (assumed: "understanding and using Alertmanager"), "Understand logs and events" (assumed: "understanding"), "Basics of SLOs, SLAs, and SLIs".
- The weights add up to 100%.

### 1b. Exam logistics — UNVERIFIED (search snippets of official LF/CNCF pages; the pages themselves were blocked)

| Fact | Value per snippet | Snippet source (not fetched) | Confidence |
|---|---|---|---|
| Format | Online, proctored, multiple-choice | training.linuxfoundation.org/certification/prometheus-certified-associate/ ; cncf.io/training/certification/pca/ | Medium-high (two independent snippets agree) |
| Duration | 90 minutes | same | Medium-high |
| Number of questions | 60 | appeared in one snippet summary only | **Medium-low**. Re-check on the LF page |
| Price | US$250 (one snippet also said bundle with LFS241 course at $299) | LF page | Medium. Prices and bundles change often |
| Retake | One free retake included | LF page / cncf.io | Medium-high |
| Validity | 2 years | LF/cncf.io | Medium-high |
| Eligibility window | 12 months from purchase to take the exam | LF/cncf.io | Medium |
| Passing score | **Not found** in any official snippet. The commonly quoted 75% is **unconfirmed** | — | Unknown |
| Prometheus version targeted | **Not stated** anywhere I could reach (the PDF does not say either) | — | Unknown |

**Before publishing:** someone with normal web access should open https://training.linuxfoundation.org/certification/prometheus-certified-associate/ and the LF Candidate Handbook / PCA FAQ on docs.linuxfoundation.org and confirm the question count, passing score, price and retake terms.

---

## 2. Curriculum map (domain › sub-item › URLs › key facts)

URL prefixes: `P` = https://prometheus.io/docs/prometheus/latest/ , `D` = https://prometheus.io/docs/ , `A` = https://prometheus.io/docs/alerting/latest/

### PromQL (28%)

**Selecting Data**
- URLs: `P`querying/basics/#instant-vector-selectors · `P`querying/basics/#range-vector-selectors · `P`querying/basics/#offset-modifier · `P`querying/basics/#-modifier (the @ modifier; check the anchor) · `P`querying/basics/#staleness · `P`querying/examples/
- Facts:
  1. Matchers: `=`, `!=`, `=~`, `!~`. Regex matches are fully anchored (`env=~"foo"` behaves as `^foo$`) and use RE2 syntax. [P querying/basics]
  2. Range selectors such as `[5m]` are **left-open, right-closed**: a sample exactly on the left boundary is excluded. [P querying/basics#range-vector-selectors]
  3. `offset` must come right after the selector (`sum(x offset 5m)` is valid, `sum(x) offset 5m` is not). Negative offsets are allowed. [P querying/basics#offset-modifier]
  4. `@ <unix-ts>` pins the evaluation time. It can be combined with `offset` in either order, and `start()` and `end()` are special values for it. [P querying/basics, @ modifier section]
  5. The default lookback is **5 minutes** (`--query.lookback-delta`, or `lookback_delta` per query). Series that stop being exported or whose target disappears are marked stale. [P querying/basics#staleness]
  6. Subquery syntax is `<instant_query>[<range>:<resolution>]`. If the resolution is left out, the global evaluation interval is used. [P querying/basics#subquery]

**Rates and Derivatives**
- URLs: `P`querying/functions/#rate · `P`querying/functions/#irate · `P`querying/functions/#increase · `P`querying/functions/#deriv · `P`querying/functions/#predict_linear · `P`querying/functions/#delta
- Facts:
  1. `rate()` is the per-second average increase over the range. It corrects for counter resets and extrapolates to the edges of the range. It suits alerting and slow-moving counters. [P functions#rate]
  2. `irate()` uses only the last two samples. Use it for graphing volatile counters, not for alerts, because short spikes can reset an alert's `for` timer. [P functions#irate]
  3. `increase()` is syntactic sugar for rate × the range in seconds, so it can return non-integers. The docs recommend `rate` in recording rules. [P functions#increase]
  4. Always take `rate`/`irate` first and aggregate afterwards; otherwise counter resets are missed. [P functions#rate; D practices/the_zen/#first-the-rate-then-aggregate]
  5. `deriv()` and `predict_linear(v, t)` use simple linear regression, need at least two float samples, and are for gauges. `delta()` is also for gauges. [P functions#deriv, #predict_linear, #delta]

**Aggregating over time**
- URLs: `P`querying/functions/#aggregation_over_time · `P`querying/basics/#subquery · `P`querying/functions/#absent_over_time
- Facts:
  1. The `*_over_time` functions are avg, min, max, sum, count, quantile, stddev, stdvar, last, present and (since 3.14) **first**. Each turns a range vector into one instant value per series. [P functions; CHANGELOG 3.14.0]
  2. Every sample in the window carries equal weight, even if the samples are unevenly spaced. [P functions]
  3. `mad_over_time` and the `ts_of_*_over_time` functions are experimental and need `--enable-feature=promql-experimental-functions`. [P functions]
  4. You can combine them with subqueries, for example `max_over_time(rate(x[5m])[1h:])`. [P querying/basics#subquery, querying/examples]

**Aggregating over dimensions**
- URLs: `P`querying/operators/#aggregation-operators · `P`querying/operators/#topk-and-bottomk · `P`querying/operators/#count_values
- Facts:
  1. The operators are sum, avg, min, max, bottomk, topk, group, count, count_values, stddev, stdvar and quantile. `limitk` and `limit_ratio` are experimental. [P operators]
  2. `without` drops the listed labels and `by` keeps only the listed labels. The clause can go before or after the expression. [P operators]
  3. To aggregate ratios, aggregate the numerator and denominator separately and then divide. Never average averages or ratios. [D practices/rules/#aggregation]

**Binary operators**
- URLs: `P`querying/operators/#binary-operators · `P`querying/operators/#vector-matching · `P`querying/operators/#many-to-one-and-one-to-many-vector-matches · `P`querying/operators/#binary-operator-precedence
- Facts:
  1. Comparison operators filter by default. Adding `bool` makes them return 0/1 and drops the metric name. Comparing two scalars requires `bool`. [P operators]
  2. `and`, `or` and `unless` work only between instant vectors and match on the exact label set. [P operators]
  3. `on()` and `ignoring()` control which labels are matched. `group_left` and `group_right` allow many-to-one and one-to-many matching. [P operators#vector-matching]
  4. Precedence from highest to lowest: `^`; `* / % atan2`; `+ -`; comparisons; `and unless`; `or`. `^` is right-associative. [P operators#binary-operator-precedence]
  5. Newer and experimental: `fill()`, `fill_left()` and `fill_right()` behind `promql-binop-fill-modifiers`, and the histogram trim operators `</` and `>/`. This is beyond 2022 exam scope. [P operators]

**Histograms**
- URLs: `D`concepts/metric_types/#histogram · `D`practices/histograms/ · `P`querying/functions/#histogram_quantile · `P`querying/functions/#histogram_fraction
- Facts:
  1. A classic histogram exposes `_bucket{le="…"}` (cumulative), `_sum` and `_count`, and `_count` equals the `le="+Inf"` bucket. [D concepts/metric_types]
  2. For classic histograms, use `histogram_quantile(0.9, sum by (le) (rate(x_bucket[10m])))`; the `le` label must be kept when aggregating. Native histograms drop the `_bucket` suffix and need no `le`. [P functions#histogram_quantile]
  3. It interpolates linearly inside a bucket for classic histograms. If the quantile falls in the top `+Inf` bucket, it returns the upper bound of the second-highest bucket. It returns NaN if there are fewer than two buckets. [P functions#histogram_quantile]
  4. Summary quantiles cannot be aggregated meaningfully (`avg(x{quantile="0.95"})` is wrong). Histograms can be aggregated. [D practices/histograms#quantiles]
  5. The average duration is `rate(x_sum[5m]) / rate(x_count[5m])`. [D practices/histograms#count-and-sum-of-observations]

**Timestamp Metrics**
- URLs: `P`querying/functions/#timestamp · `P`querying/functions/#time · `D`practices/instrumentation/#timestamps-not-time-since · `D`practices/naming/#metric-names
- Facts:
  1. `timestamp(v)` returns each sample's timestamp in seconds since the epoch. `time()` returns the evaluation time, not the wall clock. [P functions]
  2. To track how long ago something happened, export the Unix timestamp of the event and compute `time() - metric`. Do not export "seconds since". [D practices/instrumentation]
  3. The naming convention is a `_timestamp_seconds` suffix, for example `..._last_record_processed_timestamp_seconds`. [D practices/naming]
  4. Exporters should normally **not** set timestamps on exposed samples. [D instrumenting/writing_exporters/#scheduling]
  5. "Timestamp Metrics" is not defined anywhere in the curriculum. This mapping is my interpretation, and the sub-item may also cover `day_of_week()`, `hour()` and similar functions. [P functions]

### Prometheus Fundamentals (20%)

**System Architecture**
- URLs: `D`introduction/overview/#architecture · `D`introduction/overview/#components · `D`introduction/glossary/ · `P`storage/
- Facts:
  1. The components are the Prometheus server, client libraries, the Pushgateway for short-lived jobs, exporters, Alertmanager and support tools. Most are written in Go. [D overview]
  2. The server scrapes, stores samples locally, and evaluates rules to record new series or generate alerts. Grafana or other API consumers visualise the data. [D overview#architecture]
  3. Local storage groups data into 2-hour blocks, protected by a write-ahead log (WAL) in 128MB segments. [P storage]
  4. Prometheus is a CNCF project, the second hosted project after Kubernetes, joining in 2016. [D overview]

**Configuration and Scraping**
- URLs: `P`configuration/configuration/ · `P`configuration/configuration/#scrape_config · `P`configuration/configuration/#relabel_config · `P`getting_started/
- Facts:
  1. Global defaults: `scrape_interval` **1m**, `scrape_timeout` **10s**, `evaluation_interval` **1m**. [P configuration]
  2. `metrics_path` defaults to `/metrics`, `scheme` to `http`, `honor_labels` to false (conflicting scraped labels are renamed `exported_<name>`), and `honor_timestamps` to true. [P configuration#scrape_config]
  3. A config reload is triggered by SIGHUP, or by POST `/-/reload` when `--web.enable-lifecycle` is set. An invalid config is not applied. [P configuration]
  4. Relabel actions are replace (the default), keep, drop, keepequal, dropequal, hashmod, labelmap, labeldrop, labelkeep, lowercase and uppercase. Regexes are anchored. `__address__` becomes `instance` by default. [P configuration#relabel_config]
  5. Each scrape automatically adds the series `up`, `scrape_duration_seconds`, `scrape_samples_scraped`, `scrape_samples_post_metric_relabeling` and `scrape_series_added`. [D concepts/jobs_instances]

**Understanding Prometheus Limitations**
- URLs: `D`introduction/overview/#when-does-it-not-fit · `P`storage/ · `D`introduction/faq/ · `D`practices/instrumentation/#do-not-overuse-labels
- Facts:
  1. Prometheus is not suitable when you need 100% accuracy, for example per-request billing. [D overview]
  2. Local storage is not clustered or replicated. Durability and long-term storage come from remote read/write integrations. [P storage]
  3. Default retention is 15d (`--storage.tsdb.retention.time`), at roughly 1–2 bytes per sample. [P storage]
  4. Every label combination is a new series. Avoid high-cardinality labels such as user IDs and emails. The guidance is to keep cardinality under about 10 for most metrics and to investigate anything over 100. [D practices/naming#labels; practices/instrumentation]
  5. It is not a logging system. Sample values are float64, which is exact for integers only up to 2^53. HA is done by running identical servers and deduplicating, for example with Thanos. [D faq]

**Data Model and Labels**
- URLs: `D`concepts/data_model/ · `D`concepts/data_model/#metric-names-and-labels · `D`concepts/jobs_instances/ · `D`guides/utf8/
- Facts:
  1. A series is identified by its metric name plus its label set. A sample is a float64 or native-histogram value with a millisecond timestamp. [D data_model]
  2. Recommended charset: metric names `[a-zA-Z_:][a-zA-Z0-9_:]*` and label names `[a-zA-Z_][a-zA-Z0-9_]*`. **Since 3.0, any UTF-8 is allowed, but names outside the recommended set must be quoted.** Colons are reserved for recording rules. [D data_model]
  3. Labels starting with `__` are reserved for internal use. An empty label value is the same as a missing label. [D data_model]
  4. The metric name is internally the label `__name__`. [D data_model]
  5. `job` and `instance` are attached automatically when a target is scraped. [D jobs_instances]

**Exposition Format**
- URLs: `D`instrumenting/exposition_formats/ · `D`instrumenting/exposition_formats/#example · `D`instrumenting/content_negotiation/ · `D`specs/om/open_metrics_spec/
- Facts:
  1. The text format is line-oriented with `# HELP` and `# TYPE` lines. The types are counter, gauge, histogram, summary and untyped (the default when no TYPE line is present). The optional timestamp is int64 milliseconds. [D exposition_formats]
  2. The text Content-Type is `text/plain; version=0.0.4`. OpenMetrics uses `application/openmetrics-text; version=1.0.0` and must end with `# EOF`. [D exposition_formats]
  3. OpenMetrics adds GaugeHistogram, Info, StateSet, unit metadata, exemplars and created timestamps. An OpenMetrics 2.0 draft exists, and 3.15.0 implements the OM2.0 scrape format. [D exposition_formats; GitHub v3.15.0 release]
  4. The protobuf format is maintained again (its deprecation in 2.x was reversed) and is required for native histograms. [D exposition_formats]
  5. **Since 3.0, a scrape fails if the target's Content-Type is missing or invalid**, unless `fallback_scrape_protocol` is set. [D exposition_formats; P migration]

### Alerting & Dashboarding (18%)

**Dashboarding basics**
- URLs: `D`visualization/grafana/ · `D`visualization/browser/ · `D`visualization/perses/ · `D`tutorials/visualizing_metrics_using_grafana/
- Facts:
  1. Grafana has shipped a Prometheus data source since 2.5.0 (2015). Its default port is 3000 and the default login is admin/admin. [D grafana]
  2. The legend format uses label templates such as `{{method}} - {{status}}`. [D grafana]
  3. Prometheus has a built-in expression browser at `:9090/query`. [P getting_started]
  4. Recording rules are recommended for expensive expressions used by dashboards. [P configuration/recording_rules]
  5. Console templates are documented at `D`visualization/consoles/. Their status in 3.x should be checked before teaching them.

**Configuring Alerting rules**
- URLs: `P`configuration/alerting_rules/ · `P`configuration/recording_rules/#rule · `P`configuration/recording_rules/#rule_group · `P`configuration/unit_testing_rules/
- Facts:
  1. `for` sets how long the condition must hold. Until then the alert is **pending**; afterwards it is **firing**. Without `for`, the alert fires on the first evaluation. [P alerting_rules]
  2. `keep_firing_for` keeps an alert firing for a set time after the condition clears, to avoid flapping. It was added in v2.42 (Jan 2023), after the curriculum was published. [P alerting_rules; CHANGELOG]
  3. Templating uses `{{ $labels.x }}`, `{{ $value }}` and `$externalLabels`. [P alerting_rules#templating]
  4. Active alerts appear as the synthetic series `ALERTS{alertname, alertstate="pending|firing"}`. [P alerting_rules]
  5. Check rules with `promtool check rules file.yml`. Rule groups run in sequence at `interval` (default: the global `evaluation_interval`). Newer options: `query_offset`, `limit`, group-level `labels`. [P recording_rules]

**Understand and Use Alertmanager**
- URLs: `A`alertmanager/ (grouping, inhibition, silences, HA) · `A`configuration/#route · `A`configuration/#inhibit_rule · `A`overview/ · `A`high_availability/
- Facts:
  1. Alertmanager deduplicates, groups and routes alerts to receivers, and handles silences and inhibition. [A alertmanager]
  2. Route defaults: `group_wait` 30s, `group_interval` 5m, `repeat_interval` 4h. `continue` defaults to false, so routing stops at the first matching child. The global `resolve_timeout` is 5m. [A configuration]
  3. Inhibition mutes target alerts while a matching source alert fires, provided the labels listed in `equal` match. The `source_match`/`target_match` fields are deprecated in favour of `source_matchers`/`target_matchers`. [A configuration#inhibit_rule]
  4. Silences mute alerts for a set time using matchers and are created in the web UI (or with amtool). [A alertmanager#silences]
  5. For HA, point Prometheus at **all** Alertmanager instances and do not put a load balancer in between. Prometheus uses API v2 (v1 is removed in 3.x). [A alertmanager; P configuration#alertmanager_config; P migration]

**Alerting basics (when, what, and why)**
- URLs: `D`practices/alerting/ · `D`practices/the_zen/ · `A`overview/
- Facts:
  1. Keep alerting simple, alert on symptoms tied to user pain, and avoid pages that need no action. [D practices/alerting]
  2. Online serving systems: alert on latency and errors as high in the stack as possible. Batch jobs: page if the job has not succeeded within roughly two full run periods. [D practices/alerting]
  3. Meta-monitor the monitoring itself (Prometheus, Alertmanager, Pushgateway), preferably end to end. [D practices/alerting#metamonitoring]
  4. Rule of thumb: use `for` of at least 5 minutes. Alerts should be urgent, important, actionable and real. [D practices/the_zen]
  5. Alert names are conventionally CamelCase. [D practices/alerting#naming]

### Observability Concepts (18%)

**Metrics**
- URLs: `D`introduction/overview/#what-are-metrics · `D`concepts/metric_types/ · `D`concepts/data_model/
- Facts:
  1. There are four core types: counter (only increases or resets), gauge (goes up and down), histogram and summary. [D metric_types]
  2. The server stores everything as untyped floats, except native histograms. [D metric_types]
  3. Rule of thumb: if a value can go down, it is a gauge. Never `rate()` a gauge. [D practices/instrumentation]

**Understand logs and events** — *thin coverage on prometheus.io*
- URLs: `D`introduction/faq/#how-to-feed-logs-into-prometheus · `D`practices/instrumentation/#logging · `D`practices/the_zen/#if-you-can-log-it-you-can-have-a-metric-for-it
- Facts:
  1. Do not feed logs into Prometheus. Use Loki or OpenSearch instead, because Prometheus is a metrics system, not an event log. [D faq]
  2. Add a counter for every log line, and track the total number of info/warning/error lines. [D practices/instrumentation#logging]
  3. Gap: there is no prometheus.io definition of a "log" versus an "event". See Gaps.

**Tracing and Spans** — *essentially not covered on prometheus.io*
- prometheus.io only touches tracing through exemplars, which carry trace IDs in OpenMetrics (`D`instrumenting/exposition_formats/#exemplars-experimental), and through the server's own `tracing_config` (`P`configuration/configuration/#tracing_config).
- Recommended non-prometheus.io source (verified from its GitHub source, because the site was blocked): OpenTelemetry Observability primer, https://opentelemetry.io/docs/concepts/observability-primer/ (source: `open-telemetry/opentelemetry.io` → `content/en/docs/concepts/observability-primer.md`). It defines a span as a single unit of work with a name, timing data, events and attributes; distributed tracing as following a request across services; and a log as a timestamped message not necessarily tied to a request.

**Push vs Pull**
- URLs: `D`introduction/faq/#why-do-you-pull-rather-than-push · `D`practices/pushing/ · `D`instrumenting/pushing/ · `D`introduction/overview/#features
- Facts:
  1. Collection uses pull over HTTP. Push goes through the intermediary Pushgateway. [D overview]
  2. Benefits of pull: you can run extra Prometheus instances freely, tell easily when a target is down, and inspect targets by hand. The docs call pull only "slightly better". [D faq]
  3. Pushgateway pitfalls: it is a single point of failure and bottleneck, you lose the per-target `up` metric, and it never forgets series. The only recommended use is **service-level batch jobs**. [D practices/pushing]
  4. Behind a firewall or NAT, run Prometheus inside the network or use PushProx. [D practices/pushing]

**Service Discovery**
- URLs: `P`configuration/configuration/ (`#kubernetes_sd_config`, `#file_sd_config`, `#consul_sd_config`, `#ec2_sd_config`, `#static_config`, `#http_sd_config`) · `D`guides/file-sd/ · `P`http_sd/
- Facts:
  1. Targets come from static configuration or from many SD mechanisms, including Kubernetes, Consul, EC2, file, HTTP and DNS (3.14 added OCI). [P configuration]
  2. file_sd watches YAML/JSON files and applies changes without a restart. [P configuration#file_sd_config; D guides/file-sd]
  3. SD adds `__meta_*` labels, which relabeling turns into target labels. Labels starting with `__` are dropped after relabeling. [P configuration#relabel_config]
  4. Service discovery belongs in Prometheus, not in exporters. [D instrumenting/writing_exporters#deployment]

**Basics of SLOs, SLAs, and SLIs** — *thin coverage on prometheus.io*
- prometheus.io mentions SLOs only in passing: `D`practices/the_zen/#measure-what-users-care-about (let SLOs guide instrumentation and alerting; RED, USE and the Four Golden Signals) and `D`practices/histograms/ (an SLO of 95% of requests under 300ms, `histogram_fraction` versus bucket boundaries, Apdex).
- The OpenTelemetry primer (above) defines SLI (a measure of service behaviour from the user's view) and SLO (SLIs tied to business value). **No official CNCF or Prometheus source I could reach defines SLA.**

### Instrumentation and Exporters (16%)

**Client Libraries**
- URLs: `D`instrumenting/clientlibs/ · `D`instrumenting/writing_clientlibs/ · `D`guides/go-application/
- Facts:
  1. Official libraries: Go, Java/Scala, **Node.js (`prometheus/client_js`, now official)**, Python, Ruby and Rust. Everything else is third-party, and .NET now points to Microsoft's docs. [D clientlibs]
  2. The library serves the current state of all metrics over HTTP when scraped. Without a library, you can implement the exposition format yourself. [D clientlibs]
  3. Native histograms currently require a protobuf-capable library (Go, Java). [D practices/histograms]

**Instrumentation**
- URLs: `D`practices/instrumentation/ · `D`practices/instrumentation/#the-three-types-of-services · `D`practices/instrumentation/#counter-vs-gauge-summary-vs-histogram · `D`practices/instrumentation/#avoid-missing-metrics
- Facts:
  1. Instrument everything. There are three service types: online-serving (queries, errors, latency), offline processing, and batch jobs (last-success timestamp, pushed). [D practices/instrumentation]
  2. Count online-serving queries when they end, so the count lines up with errors and latency. [same]
  3. Keep label cardinality low; most metrics should have no labels. [same]
  4. Initialise labelled metrics up front so series are not missing. [same]
  5. A Java counter increment costs about 12–17ns. Be careful above about 100k calls per second. [same#inner-loops]

**Exporters**
- URLs: `D`instrumenting/exporters/ · `D`instrumenting/writing_exporters/ · `D`guides/node-exporter/ · `D`guides/multi-target-exporter/
- Facts:
  1. Exporters cover systems you cannot instrument directly, such as HAProxy or Linux stats. Some are official, others community-maintained. JMX exporter covers JVM applications. [D exporters]
  2. Run one exporter per application instance, next to it. Exceptions are blackbox, SNMP and IPMI, which use the multi-target pattern. [D writing_exporters#deployment]
  3. Scrapes should be synchronous, without timers inside the exporter or timestamps on samples. The default scrape timeout is 10s. [D writing_exporters#scheduling]
  4. Use `UNTYPED` when the type is unclear. A counter that can decrease is not a counter. Target labels such as region belong in the Prometheus config, not in the exporter. [D writing_exporters]

**Structuring and naming metrics**
- URLs: `D`practices/naming/ · `D`practices/naming/#base-units · `D`practices/rules/#naming · `D`concepts/data_model/
- Facts:
  1. Use a single-word application prefix (namespace), one unit per metric, base units (seconds, bytes, meters, celsius, ratio 0–1, grams), and plural unit suffixes. [D naming]
  2. Accumulating counts end in `_total` (`process_cpu_seconds_total`). Build metadata uses `_info`. Timestamps use `_timestamp_seconds`. [D naming]
  3. Do not put label names in metric names. Either `sum()` or `avg()` across all dimensions should make sense. [D naming]
  4. Recording rules are named `level:metric:operations`: strip `_total` when taking a rate, use `_per_` with `ratio` for division, and aggregate with `without`. [D practices/rules]

---

## 3. Prometheus version and 3.x caveats (risk that study material or the exam lags the docs)

- **Latest release:** **v3.15.0 (2026-09-24), marked "Latest"** on https://github.com/prometheus/prometheus/releases. v3.13.4, a patch to the LTS line, followed on 2026-09-29. Current LTS is 3.13 (supported to 2027-07-31), per `docs-config.ts`. 3.0.0 shipped on 2024-11-14. Alertmanager main is at 0.34.1.
- **The curriculum dates from 2022-08-31**, when Prometheus 2.x was current (2.38/2.39). Exam questions probably reflect 2.x behaviour. I could not verify this, so treat it as an inference.

Changes in 3.x that conflict with older study material (source: `P`migration/, CHANGELOG):
1. **UTF-8 metric and label names** are allowed, with quoting `{"my.metric"}`. `metric_name_validation_scheme: legacy` restores the old behaviour.
2. **Range selectors and lookback are left-open** (they were left-closed in 2.x). A `[5m]` window over 1-minute samples now always holds 5 samples, and `foo[1m:1m]` subqueries can return no data.
3. **Regex `.` matches newline.**
4. **`holt_winters` was renamed to `double_exponential_smoothing`** and is now experimental (behind a flag).
5. **Strict scrape Content-Type** (see `fallback_scrape_protocol`).
6. Former feature flags are now default behaviour: `@` modifier, negative offset, expand-external-labels, auto GOMEMLIMIT/GOMAXPROCS. `agent` and `remote-write-receiver` became dedicated CLI flags. **No default port is added to targets any more.**
7. **Native histograms are stable from v3.8** (the flag does nothing from 3.9), but scraping them must be enabled with `scrape_native_histograms: true`. `scrape_classic_histograms` was renamed `always_scrape_classic_histograms`. NHCB (`convert_classic_histograms_to_nhcb`) exists. **The practices/histograms page was rewritten to favour native histograms**, which shifts its emphasis away from classic-histogram-centric material.
8. `le` and `quantile` label values are normalised (`le="1"` becomes `le="1.0"`), which affects queries that match exact strings.
9. Alertmanager API v1 is no longer supported from Prometheus.
10. New since 2022, probably not on the exam: `keep_firing_for` (2.42), duration expressions (`[5m*2]`, `step()`, `range()`; on by default in 3.14), `anchored`/`smoothed` range modifiers (the flag is now a no-op), `first_over_time` (stable in 3.14), `info()`, fill modifiers, trim operators, `limitk`, rule `query_offset`, group-level `labels`, OTLP receiver, OM 2.0 (3.15), Node.js as an official client.
11. 3.15 deprecates the `--log.level` flag in favour of `runtime.log_level`.

**Recommendation:** teach the curriculum concepts using 3.x docs, and add a "2.x vs 3.x" callout wherever behaviour differs (items 2, 4 and 7 especially). Do not assume the exam tests 3.x-only features.

---

## 4. Sample artifacts (short quotes from official docs)

**/metrics exposition**: from `D`instrumenting/exposition_formats/#example
```
# HELP http_requests_total The total number of HTTP requests.
# TYPE http_requests_total counter
http_requests_total{method="post",code="200"} 1027 1395066363000
http_requests_total{method="post",code="400"}    3 1395066363000
```

**prometheus.yml**: from `P`getting_started/
```yaml
global:
  scrape_interval:     15s # By default, scrape targets every 15 seconds.
scrape_configs:
  - job_name: 'prometheus'
    scrape_interval: 5s
    static_configs:
      - targets: ['localhost:9090']
```
(The full snippet also sets `external_labels: monitor: 'codelab-monitor'`. Note that the example uses 15s while the built-in default is 1m.)

**Alerting rule**: from `P`configuration/alerting_rules/#templating
```yaml
- alert: InstanceDown
  expr: up == 0
  for: 5m
  labels:
    severity: page
  annotations:
    summary: "Instance {{ $labels.instance }} down"
```

**alertmanager.yml route**: from `A`configuration/#example
```yaml
route:
  receiver: 'default-receiver'
  group_wait: 30s
  group_interval: 5m
  repeat_interval: 4h
  group_by: [cluster, alertname]
  routes:
  - receiver: 'database-pager'
    group_wait: 10s
    matchers:
    - service=~"mysql|cassandra"
```

**Recording rule**: from `P`configuration/recording_rules/
```yaml
groups:
  - name: example
    rules:
    - record: code:prometheus_http_requests_total:sum
      expr: sum by (code) (prometheus_http_requests_total)
```

---

## 5. Gaps and recommendations

1. **Exam logistics are unverified.** The question count (60), passing score (not found, often said to be 75%) and price ($250) must be confirmed on the LF page and Candidate Handbook by someone with normal web access. Show them as "per LF site, check before booking" and include a last-checked date.
2. **Tracing and Spans, logs vs events, and SLO/SLA/SLI** have little or no coverage on prometheus.io. Recommendation (for you to decide): accept **opentelemetry.io** docs as a source, since OpenTelemetry is an official CNCF project. Its Observability primer covers logs, spans, traces, SLI and SLO. **SLA has no official CNCF/Prometheus definition** that I found. Options are the Google SRE book (not CNCF; would need a policy decision) or a short definition written in house and marked as general industry knowledge.
3. **"Timestamp Metrics"** has no definition in the curriculum. My mapping (the `timestamp()` and `time()` functions, the timestamps-not-time-since practice, `_timestamp_seconds` naming, exporters not setting timestamps) is an interpretation.
4. **"Dashboarding basics"**: the Grafana page on prometheus.io is short and its UI steps ("cogwheel" menu) are dated. Perses is now also documented (`D`visualization/perses/), which is new since 2022.
5. **Version drift:** the curriculum is from Aug 2022 (2.x era) and the docs are at 3.15. Keep 2.x/3.x callouts; see section 3.
6. **Anchors:** check them on the rendered site, especially the `@` modifier anchor and backticked function headings.
7. Docs content is versioned under `/docs/prometheus/latest/`. For long-lived content, consider pinning to an LTS path such as `/docs/prometheus/3.13/`, if the site exposes it (`minNumVersions: 10` suggests versioned paths exist; not verified).

---

## 6. Every URL / source actually fetched or read

Fetched over the network:
- https://github.com/cncf/curriculum (WebFetch: repo listing)
- https://raw.githubusercontent.com/cncf/curriculum/master/PCA_Curriculum.pdf (curl, text extracted)
- https://github.com/cncf/curriculum/commits/master/PCA_Curriculum.pdf (WebFetch) plus `git log` on a clone of https://github.com/cncf/curriculum
- https://github.com/prometheus/prometheus/releases (WebFetch)
- https://github.com/prometheus/prometheus/releases/tag/v3.15.0 (WebFetch)
- https://raw.githubusercontent.com/open-telemetry/opentelemetry.io/main/content/en/docs/concepts/observability-primer.md (curl), the source of https://opentelemetry.io/docs/concepts/observability-primer/
- Git clones (read locally): https://github.com/prometheus/docs, https://github.com/prometheus/prometheus, https://github.com/prometheus/alertmanager

Source files read, each mapped to its prometheus.io page:
- prometheus/docs: `docs-config.ts`; `docs/introduction/overview.md` → /docs/introduction/overview/; `concepts/data_model.md`; `concepts/jobs_instances.md`; `concepts/metric_types.md`; `practices/histograms.md`; `practices/rules.md`; `practices/naming.md`; `practices/instrumentation.md`; `practices/alerting.md`; `practices/pushing.md`; `practices/the_zen.md`; `instrumenting/exposition_formats.md`; `instrumenting/clientlibs.md`; `instrumenting/exporters.md`; `instrumenting/writing_exporters.md`; `instrumenting/pushing.md`; `visualization/grafana.md`; `introduction/faq.md`; `introduction/comparison.md` (scope section); `introduction/glossary.md` (headings); `guides/file-sd.md` (intro); `guides/opentelemetry.md` (headings); `specs/native_histograms.md` (status lines)
- prometheus/prometheus: `docs/querying/basics.md` → /docs/prometheus/latest/querying/basics/; `querying/functions.md`; `querying/operators.md`; `querying/examples.md` (headings); `configuration/configuration.md` (global, scrape_config, relabel_config, file_sd_config, alertmanager_config); `configuration/alerting_rules.md`; `configuration/recording_rules.md`; `storage.md`; `getting_started.md`; `migration.md`; `feature_flags.md` (grep); `CHANGELOG.md`; `VERSION`
- prometheus/alertmanager: `docs/alertmanager.md` → /docs/alerting/latest/alertmanager/; `docs/overview.md`; `docs/configuration.md` (route, example, inhibit_rule, global defaults); `VERSION`

Attempted and blocked by the egress proxy (NOT verified): prometheus.io (all pages), https://training.linuxfoundation.org/certification/prometheus-certified-associate/, https://www.cncf.io/training/certification/pca/, https://docs.linuxfoundation.org/tc-docs/certification/frequently-asked-questions-pca, https://opentelemetry.io/docs/concepts/observability-primer/.
WebSearch (snippets only, not counted as verified): two queries limited to training.linuxfoundation.org / cncf.io / docs.linuxfoundation.org.
