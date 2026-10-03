/**
 * Exams: the pre-course check and full mock exams.
 *
 * Both draw from an exam-only question pool (never shown in daily practice), so a
 * mock score measures what you know rather than which practice questions you
 * remember. Mocks follow the real exam's blueprint: question count split by
 * domain weight, timed, no feedback until the end.
 *
 * The pass estimate is deliberately a range. Each domain's ability is treated as
 * uncertain (a Beta posterior over that domain's answers), and we simulate many
 * exams to see how often a score clears the pass mark. Correct answers marked
 * "guess" count half, because a lucky guess isn't knowledge you can rely on.
 */
import { gradeAnswer } from "./grading";

export type Confidence = "sure" | "think" | "guess";
export const CONFIDENCE_LABEL: Record<Confidence, string> = { sure: "Sure", think: "Think so", guess: "Guess" };

export type ExamAnswer = { selected: string[]; confidence?: Confidence; flagged?: boolean };
export type ExamAnswers = Record<string, ExamAnswer>;

export type Rng = () => number;

/** Small seeded PRNG so assembly and estimates are reproducible in tests. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(xs: T[], rng: Rng): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Split `total` questions across domains by weight (largest remainder, so it always sums to total). */
export function examBlueprint(domains: { id: string; weight: number }[], total: number): Record<string, number> {
  const sum = domains.reduce((s, d) => s + d.weight, 0) || 1;
  const raw = domains.map((d) => ({ id: d.id, exact: (d.weight / sum) * total }));
  const out: Record<string, number> = Object.fromEntries(raw.map((r) => [r.id, Math.floor(r.exact)]));
  let left = total - Object.values(out).reduce((s, n) => s + n, 0);
  for (const r of [...raw].sort((a, b) => (b.exact % 1) - (a.exact % 1))) {
    if (left-- <= 0) break;
    out[r.id]++;
  }
  return out;
}

export type PoolItem = { id: string; domain: string; topic: string };

/**
 * Pick a mock exam: per domain, least-seen questions first (random among ties),
 * then shuffle the whole exam so domains are interleaved like the real thing.
 * If the pool is short in a domain, the exam is shorter rather than repeating.
 */
export function assembleMock(opts: { pool: PoolItem[]; counts: Record<string, number>; seen: Map<string, number>; rng: Rng }): string[] {
  const picked: string[] = [];
  for (const [domain, n] of Object.entries(opts.counts)) {
    const inDomain = shuffle(opts.pool.filter((q) => q.domain === domain), opts.rng);
    inDomain.sort((a, b) => (opts.seen.get(a.id) ?? 0) - (opts.seen.get(b.id) ?? 0)); // stable: keeps random order among ties
    picked.push(...inDomain.slice(0, n).map((q) => q.id));
  }
  return shuffle(picked, opts.rng);
}

/**
 * Pick the pre-course check: `perDomain` questions per domain, spread across as
 * many different topics as possible so the result says something about each.
 * Ordered by domain so it reads as a tour of the curriculum.
 */
export function assembleDiagnostic(opts: { pool: PoolItem[]; domains: string[]; perDomain: number; topicOrder: string[]; rng: Rng }): string[] {
  const out: string[] = [];
  for (const domain of opts.domains) {
    const byTopic = new Map<string, PoolItem[]>();
    for (const q of shuffle(opts.pool.filter((x) => x.domain === domain), opts.rng)) {
      byTopic.set(q.topic, [...(byTopic.get(q.topic) ?? []), q]);
    }
    const topics = shuffle([...byTopic.keys()], opts.rng);
    const chosen: PoolItem[] = [];
    while (chosen.length < opts.perDomain && topics.some((t) => byTopic.get(t)!.length)) {
      for (const t of topics) {
        const q = byTopic.get(t)!.shift();
        if (q && chosen.length < opts.perDomain) chosen.push(q);
      }
    }
    chosen.sort((a, b) => opts.topicOrder.indexOf(a.topic) - opts.topicOrder.indexOf(b.topic));
    out.push(...chosen.map((q) => q.id));
  }
  return out;
}

export type GradableItem = PoolItem & { options: { id: string; correct: boolean }[] };
type Tally = { total: number; correct: number };

export type ExamResult = {
  total: number;
  answered: number;
  correct: number;
  percent: number; // 0–100
  byDomain: Record<string, Tally & { effective: number }>;
  byTopic: Record<string, Tally>;
  calibration: Record<Confidence | "none", Tally>;
  perQuestion: Record<string, { correct: boolean; confidence: Confidence | null }>;
  /** Marked "sure" but wrong: the most valuable things to review. */
  confidentlyWrong: string[];
  estimate: PassEstimate;
};

export type PassEstimate = {
  low: number; // 10th percentile score, 0–100
  mid: number; // median
  high: number; // 90th percentile
  passProbability: number; // 0–1
  passPercent: number;
  basedOn: number; // answers the estimate rests on
};

export function gradeExam(opts: {
  items: GradableItem[];
  answers: ExamAnswers;
  blueprint: Record<string, number>;
  passPercent: number;
  rng: Rng;
  sims?: number;
}): ExamResult {
  const byDomain: ExamResult["byDomain"] = {};
  const byTopic: ExamResult["byTopic"] = {};
  const calibration: ExamResult["calibration"] = { sure: t0(), think: t0(), guess: t0(), none: t0() };
  const perQuestion: ExamResult["perQuestion"] = {};
  const confidentlyWrong: string[] = [];
  let correct = 0, answered = 0;

  for (const q of opts.items) {
    const a = opts.answers[q.id];
    const sel = a?.selected ?? [];
    const ok = sel.length > 0 && gradeAnswer(q.options, sel);
    const conf = sel.length ? a?.confidence ?? null : null;
    if (sel.length) answered++;
    if (ok) correct++;
    perQuestion[q.id] = { correct: ok, confidence: conf };

    const d = (byDomain[q.domain] ??= { total: 0, correct: 0, effective: 0 });
    d.total++;
    if (ok) { d.correct++; d.effective += conf === "guess" ? 0.5 : 1; }
    const t = (byTopic[q.topic] ??= t0());
    t.total++;
    if (ok) t.correct++;
    if (sel.length) {
      const c = calibration[conf ?? "none"];
      c.total++;
      if (ok) c.correct++;
    }
    if (!ok && conf === "sure") confidentlyWrong.push(q.id);
  }

  const total = opts.items.length;
  return {
    total,
    answered,
    correct,
    percent: total ? Math.round((1000 * correct) / total) / 10 : 0,
    byDomain,
    byTopic,
    calibration,
    perQuestion,
    confidentlyWrong,
    estimate: estimatePass({ byDomain, blueprint: opts.blueprint, passPercent: opts.passPercent, rng: opts.rng, sims: opts.sims }),
  };
}

const t0 = (): Tally => ({ total: 0, correct: 0 });

/** Monte Carlo over per-domain Beta(1 + effective right, 1 + rest) abilities, sitting the real exam's blueprint. */
export function estimatePass(opts: {
  byDomain: Record<string, { total: number; effective: number }>;
  blueprint: Record<string, number>;
  passPercent: number;
  rng: Rng;
  sims?: number;
}): PassEstimate {
  const sims = opts.sims ?? 4000;
  const domains = Object.entries(opts.blueprint).filter(([, n]) => n > 0);
  const examTotal = domains.reduce((s, [, n]) => s + n, 0) || 1;
  const scores: number[] = new Array(sims);
  let passes = 0;
  for (let s = 0; s < sims; s++) {
    let right = 0;
    for (const [id, n] of domains) {
      const d = opts.byDomain[id] ?? { total: 0, effective: 0 };
      const p = sampleBeta(1 + d.effective, 1 + d.total - d.effective, opts.rng);
      for (let k = 0; k < n; k++) if (opts.rng() < p) right++;
    }
    const pct = (100 * right) / examTotal;
    scores[s] = pct;
    if (pct >= opts.passPercent) passes++;
  }
  scores.sort((a, b) => a - b);
  const q = (f: number) => Math.round(scores[Math.min(sims - 1, Math.floor(f * sims))]);
  return {
    low: q(0.1),
    mid: q(0.5),
    high: q(0.9),
    passProbability: passes / sims,
    passPercent: opts.passPercent,
    basedOn: Object.values(opts.byDomain).reduce((s, d) => s + d.total, 0),
  };
}

function sampleNormal(rng: Rng): number {
  let u = 0;
  while (u === 0) u = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
}

/** Marsaglia–Tsang gamma sampler (shape ≥ 1 here, since Beta parameters are ≥ 1). */
function sampleGamma(shape: number, rng: Rng): number {
  if (shape < 1) return sampleGamma(shape + 1, rng) * Math.pow(rng(), 1 / shape);
  const d = shape - 1 / 3, c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x: number, v: number;
    do { x = sampleNormal(rng); v = 1 + c * x; } while (v <= 0);
    v = v * v * v;
    const u = rng();
    if (u < 1 - 0.0331 * x ** 4 || Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

function sampleBeta(a: number, b: number, rng: Rng): number {
  const x = sampleGamma(a, rng);
  return x / (x + sampleGamma(b, rng));
}

/** Diagnostic bands for "highlight weak areas": calm words, not grades. */
export type Band = "strong" | "okay" | "focus";
export function band(correct: number, total: number): Band {
  if (!total) return "focus";
  const r = correct / total;
  return r >= 0.8 ? "strong" : r >= 0.5 ? "okay" : "focus";
}
export const BAND_LABEL: Record<Band, string> = { strong: "Strong start", okay: "Some gaps", focus: "Focus area" };
