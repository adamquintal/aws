import { describe, it, expect } from "vitest";
import { computeReadiness, sinceDayOne, weakestTopics, type AttemptLite, type DomainDef } from "@/lib/engine/readiness";

const domains: DomainDef[] = [
  { id: "a", title: "Alpha", weight: 60, topicIds: ["a1", "a2"] },
  { id: "b", title: "Beta", weight: 40, topicIds: ["b1"] },
];
let t = 0;
const at = (domainId: string, topicId: string, correct: boolean, firstAttempt = false): AttemptLite => ({
  domainId, topicId, correct, firstAttempt, createdAt: new Date(2026, 0, 1, 0, 0, t++),
});
const many = (n: number, d: string, topic: string, correctRatio: number) =>
  Array.from({ length: n }, (_, i) => at(d, topic, i < Math.round(n * correctRatio)));

describe("readiness score", () => {
  it("is 0 with no progress", () => {
    const r = computeReadiness({ domains, attempts: [], mastered: new Set(), mockPassed: false });
    expect(r.score).toBe(0);
    expect(r.readyToBook).toBe(false);
  });

  it("counts the full curriculum: unmastered topics pull the score down", () => {
    const attempts = many(30, "a", "a1", 1);
    const r = computeReadiness({ domains, attempts, mastered: new Set(["a1"]), mockPassed: false });
    // Alpha: 100% accuracy × 50% coverage × 60 weight = 30; Beta: 0
    expect(r.score).toBe(30);
  });

  it("weights domains by exam weight", () => {
    const attempts = [...many(30, "a", "a1", 0.9), ...many(30, "b", "b1", 0.5)];
    const r = computeReadiness({ domains, attempts, mastered: new Set(["a1", "a2", "b1"]), mockPassed: true });
    expect(r.score).toBeCloseTo(0.6 * 90 + 0.4 * 50, 1);
  });

  it("uses only the most recent window of attempts", () => {
    const old = many(50, "b", "b1", 0); // all wrong, long ago
    const recent = many(30, "b", "b1", 1); // all right, recently
    const r = computeReadiness({ domains, attempts: [...old, ...recent], mastered: new Set(["b1"]), mockPassed: false, recentWindow: 30 });
    expect(r.domains.find((d) => d.domainId === "b")!.recentAccuracy).toBe(1);
  });

  it("ignores mock exam attempts for domain accuracy", () => {
    const mock = { ...at("b", "b1", false), context: "mock" };
    const r = computeReadiness({ domains, attempts: [mock], mastered: new Set(), mockPassed: false });
    expect(r.domains.find((d) => d.domainId === "b")!.recentCount).toBe(0);
  });

  it("ready to book only when every domain ≥ 80%, everything mastered, and a mock is passed", () => {
    const attempts = [...many(30, "a", "a1", 0.85), ...many(30, "b", "b1", 0.8)];
    const all = new Set(["a1", "a2", "b1"]);
    expect(computeReadiness({ domains, attempts, mastered: all, mockPassed: false }).readyToBook).toBe(false);
    const ready = computeReadiness({ domains, attempts, mastered: all, mockPassed: true });
    expect(ready.readyToBook).toBe(true);
    expect(ready.nextSteps).toEqual([]);
  });

  it("not ready when one domain is below threshold, with a calm next step", () => {
    const attempts = [...many(30, "a", "a1", 0.95), ...many(30, "b", "b1", 0.7)];
    const r = computeReadiness({ domains, attempts, mastered: new Set(["a1", "a2", "b1"]), mockPassed: true });
    expect(r.readyToBook).toBe(false);
    expect(r.nextSteps).toEqual(["Bring Beta from 70% to 80% with focused reviews."]);
  });

  it("requires a minimum recent sample before trusting accuracy", () => {
    const attempts = [...many(30, "a", "a1", 1), ...many(5, "b", "b1", 1)];
    const r = computeReadiness({ domains, attempts, mastered: new Set(["a1", "a2", "b1"]), mockPassed: true });
    expect(r.readyToBook).toBe(false);
    expect(r.nextSteps[0]).toMatch(/Beta/);
  });
});

describe("since day one", () => {
  it("compares first-attempt accuracy with recent accuracy", () => {
    const attempts = [at("a", "a1", false, true), at("a", "a1", false, true), at("a", "a1", true), at("a", "a1", true)];
    const [a] = sinceDayOne(domains, attempts, 2);
    expect(a.firstAccuracy).toBe(0);
    expect(a.recentAccuracy).toBe(1);
  });
});

describe("weakest topics", () => {
  it("lists low-accuracy topics with enough data, weakest first", () => {
    const attempts = [...many(5, "a", "a1", 0.4), ...many(5, "a", "a2", 0.8), ...many(5, "b", "b1", 1), ...many(2, "b", "x", 0)];
    expect(weakestTopics(attempts).map((w) => w.topicId)).toEqual(["a1", "a2"]);
  });
});
