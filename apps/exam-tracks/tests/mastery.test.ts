import { describe, it, expect } from "vitest";
import { applyAnswer, completeExplainBack, emptyGate, topicStatuses, type GateState } from "@/lib/engine/mastery";

const now = new Date("2026-10-01T10:00:00Z");
const right = { correct: true, hintUsed: false };
const wrong = { correct: false, hintUsed: false };
const hinted = { correct: true, hintUsed: true };

function answerMany(state: GateState, answers: { correct: boolean; hintUsed: boolean }[], target = 10) {
  for (const a of answers) state = applyAnswer(state, a, target, now).state;
  return state;
}

describe("mastery gate", () => {
  it("reaches the gate after exactly 10 correct in a row", () => {
    const s9 = answerMany(emptyGate(), Array(9).fill(right));
    expect(s9.run).toBe(9);
    expect(s9.gateReachedAt).toBeNull();
    const r = applyAnswer(s9, right, 10, now);
    expect(r.event).toBe("gate-reached");
    expect(r.state.gateReachedAt).toEqual(now);
    expect(r.state.masteredAt).toBeNull(); // still needs explain-it-back
  });

  it("a miss resets the run but keeps the best run", () => {
    const s = answerMany(emptyGate(), [...Array(7).fill(right)]);
    const r = applyAnswer(s, wrong, 10, now);
    expect(r.event).toBe("reset");
    expect(r.state.run).toBe(0);
    expect(r.state.bestRun).toBe(7);
  });

  it("a correct answer that used a hint does not count and resets the run", () => {
    const s = answerMany(emptyGate(), [right, right, hinted]);
    expect(s.run).toBe(0);
  });

  it("a miss with no run in progress reports unchanged, not reset", () => {
    expect(applyAnswer(emptyGate(), wrong, 10, now).event).toBe("unchanged");
  });

  it("answers after the gate is reached do not take it away", () => {
    const gated = answerMany(emptyGate(), Array(10).fill(right));
    const r = applyAnswer(gated, wrong, 10, now);
    expect(r.event).toBe("unchanged");
    expect(r.state.gateReachedAt).toEqual(now);
  });

  it("explain-it-back completes mastery only after the gate", () => {
    expect(() => completeExplainBack(emptyGate(), now)).toThrow();
    const gated = answerMany(emptyGate(), Array(10).fill(right));
    expect(completeExplainBack(gated, now).masteredAt).toEqual(now);
  });

  it("respects a custom run target", () => {
    expect(answerMany(emptyGate(), Array(3).fill(right), 3).gateReachedAt).not.toBeNull();
  });
});

describe("topic unlocking", () => {
  const topics = [
    { id: "a", hasContent: true },
    { id: "b", hasContent: true },
    { id: "c", hasContent: false },
    { id: "d", hasContent: true },
  ];
  const mastered = { ...emptyGate(), masteredAt: now };

  it("only the first unmastered topic is open", () => {
    const s = topicStatuses(topics, new Map());
    expect([...s.values()]).toEqual(["current", "locked", "locked", "locked"]);
  });

  it("next topic unlocks only after mastery", () => {
    const gated = { ...emptyGate(), run: 10, gateReachedAt: now };
    expect(topicStatuses(topics, new Map([["a", gated]])).get("a")).toBe("explain-back");
    expect(topicStatuses(topics, new Map([["a", gated]])).get("b")).toBe("locked");
    expect(topicStatuses(topics, new Map([["a", mastered]])).get("b")).toBe("current");
  });

  it("a topic without content yet is shown as coming soon and blocks later topics", () => {
    const s = topicStatuses(topics, new Map([["a", mastered], ["b", mastered]]));
    expect(s.get("c")).toBe("coming-soon");
    expect(s.get("d")).toBe("locked");
  });
});
