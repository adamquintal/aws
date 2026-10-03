import { describe, expect, it } from "vitest";
import { assembleDiagnostic, assembleMock, band, estimatePass, examBlueprint, gradeExam, mulberry32, type GradableItem } from "@/lib/engine/exam";

const DOMAINS = [
  { id: "promql", weight: 28 },
  { id: "fundamentals", weight: 20 },
  { id: "alerting", weight: 18 },
  { id: "observability", weight: 18 },
  { id: "instrumentation", weight: 16 },
];

function pool(perDomain: number, topicsPerDomain = 3) {
  return DOMAINS.flatMap((d) =>
    Array.from({ length: perDomain }, (_, i) => ({ id: `${d.id}-${i}`, domain: d.id, topic: `${d.id}-t${i % topicsPerDomain}` })),
  );
}

describe("examBlueprint", () => {
  it("splits 60 questions by PCA domain weight and sums exactly", () => {
    const b = examBlueprint(DOMAINS, 60);
    expect(b).toEqual({ promql: 17, fundamentals: 12, alerting: 11, observability: 11, instrumentation: 9 });
    expect(Object.values(b).reduce((s, n) => s + n, 0)).toBe(60);
  });
  it("always sums to the total", () => {
    for (const n of [1, 7, 25, 33, 100]) expect(Object.values(examBlueprint(DOMAINS, n)).reduce((s, x) => s + x, 0)).toBe(n);
  });
});

describe("assembleMock", () => {
  it("follows the blueprint with no repeats", () => {
    const ids = assembleMock({ pool: pool(40), counts: examBlueprint(DOMAINS, 60), seen: new Map(), rng: mulberry32(1) });
    expect(ids).toHaveLength(60);
    expect(new Set(ids).size).toBe(60);
    expect(ids.filter((id) => id.startsWith("promql-"))).toHaveLength(17);
  });
  it("prefers questions you haven't seen", () => {
    const p = pool(20);
    const seen = new Map(p.filter((q) => Number(q.id.split("-")[1]) < 10).map((q) => [q.id, 1]));
    const ids = assembleMock({ pool: p, counts: { promql: 10 }, seen, rng: mulberry32(2) });
    expect(ids.every((id) => Number(id.split("-")[1]) >= 10)).toBe(true);
  });
  it("is shorter rather than repeating when the pool runs out", () => {
    expect(assembleMock({ pool: pool(5), counts: { promql: 17 }, seen: new Map(), rng: mulberry32(3) })).toHaveLength(5);
  });
});

describe("assembleDiagnostic", () => {
  it("takes perDomain questions from each domain, spread across topics", () => {
    const ids = assembleDiagnostic({ pool: pool(30, 6), domains: DOMAINS.map((d) => d.id), perDomain: 5, topicOrder: [], rng: mulberry32(4) });
    expect(ids).toHaveLength(25);
    const p = pool(30, 6);
    const promqlTopics = ids.filter((id) => id.startsWith("promql-")).map((id) => p.find((q) => q.id === id)!.topic);
    expect(new Set(promqlTopics).size).toBe(5);
  });
});

function items(n: number, domain = "promql"): GradableItem[] {
  return Array.from({ length: n }, (_, i) => ({ id: `q${i}`, domain, topic: `t${i % 2}`, options: [{ id: "a", correct: true }, { id: "b", correct: false }] }));
}

describe("gradeExam", () => {
  it("scores, tallies confidence and lists confidently-wrong answers", () => {
    const answers = {
      q0: { selected: ["a"], confidence: "sure" as const },
      q1: { selected: ["b"], confidence: "sure" as const },
      q2: { selected: ["a"], confidence: "guess" as const },
      q3: { selected: [] },
    };
    const r = gradeExam({ items: items(4), answers, blueprint: { promql: 10 }, passPercent: 75, rng: mulberry32(5), sims: 500 });
    expect(r.correct).toBe(2);
    expect(r.answered).toBe(3);
    expect(r.percent).toBe(50);
    expect(r.calibration.sure).toEqual({ total: 2, correct: 1 });
    expect(r.calibration.guess).toEqual({ total: 1, correct: 1 });
    expect(r.confidentlyWrong).toEqual(["q1"]);
    expect(r.byDomain.promql.effective).toBe(1.5); // the correct guess counts half
  });
});

describe("estimatePass", () => {
  const bp = examBlueprint(DOMAINS, 60);
  const all = (frac: number, n = 20) => Object.fromEntries(DOMAINS.map((d) => [d.id, { total: n, effective: frac * n }]));
  it("is confident for consistently strong answers", () => {
    const e = estimatePass({ byDomain: all(0.95), blueprint: bp, passPercent: 75, rng: mulberry32(6) });
    expect(e.passProbability).toBeGreaterThan(0.95);
    expect(e.low).toBeGreaterThanOrEqual(80);
  });
  it("is near zero for weak answers", () => {
    expect(estimatePass({ byDomain: all(0.4), blueprint: bp, passPercent: 75, rng: mulberry32(7) }).passProbability).toBeLessThan(0.02);
  });
  it("gives a wider range with fewer answers", () => {
    const few = estimatePass({ byDomain: all(0.75, 5), blueprint: bp, passPercent: 75, rng: mulberry32(8) });
    const many = estimatePass({ byDomain: all(0.75, 60), blueprint: bp, passPercent: 75, rng: mulberry32(8) });
    expect(few.high - few.low).toBeGreaterThan(many.high - many.low);
  });
  it("is reproducible with the same seed", () => {
    const a = estimatePass({ byDomain: all(0.7), blueprint: bp, passPercent: 75, rng: mulberry32(9) });
    const b = estimatePass({ byDomain: all(0.7), blueprint: bp, passPercent: 75, rng: mulberry32(9) });
    expect(a).toEqual(b);
  });
});

describe("band", () => {
  it("maps accuracy to calm labels", () => {
    expect(band(5, 5)).toBe("strong");
    expect(band(3, 5)).toBe("okay");
    expect(band(1, 5)).toBe("focus");
  });
});
