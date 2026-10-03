import { describe, it, expect } from "vitest";
import { buildSession, orderCurrentTopic, type QuestionStat } from "@/lib/engine/session";

let seed = 1;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const q = (id: string, topicId = "cur", extra: Partial<QuestionStat> = {}): QuestionStat => ({
  questionId: id, topicId, seen: 0, lastCorrect: null, lastSeenAt: null, ...extra,
});
const current = Array.from({ length: 12 }, (_, i) => q(`c${i}`));
const mastered = Array.from({ length: 8 }, (_, i) => ({ questionId: `m${i}`, topicId: "old" }));

describe("daily session", () => {
  it("orders warm-up, then reviews, then the current topic, ~10 items", () => {
    const due = [{ questionId: "m5", topicId: "old" }, { questionId: "m6", topicId: "old" }];
    const s = buildSession({ size: 10, current, due, masteredPool: mastered, rand });
    expect(s).toHaveLength(10);
    expect(s.slice(0, 2).every((i) => i.kind === "warmup")).toBe(true);
    expect(s.slice(2, 4).map((i) => i.questionId)).toEqual(["m5", "m6"]);
    expect(s.slice(4).every((i) => i.kind === "learn")).toBe(true);
  });

  it("never repeats a question and never warms up with an item that is already due", () => {
    const due = mastered.slice(0, 6);
    const s = buildSession({ size: 10, current, due, masteredPool: mastered, rand });
    const ids = s.map((i) => i.questionId);
    expect(new Set(ids).size).toBe(ids.length);
    const warm = s.filter((i) => i.kind === "warmup").map((i) => i.questionId);
    expect(warm.every((id) => !due.some((d) => d.questionId === id))).toBe(true);
  });

  it("caps reviews when there is something new to learn", () => {
    const due = Array.from({ length: 9 }, (_, i) => ({ questionId: `d${i}`, topicId: "old" }));
    const s = buildSession({ size: 10, current, due, masteredPool: [], rand });
    expect(s.filter((i) => i.kind === "review")).toHaveLength(3);
    expect(s.filter((i) => i.kind === "learn")).toHaveLength(7);
  });

  it("with nothing new to learn, uses reviews then extra practice", () => {
    const due = [{ questionId: "m1", topicId: "old" }];
    const s = buildSession({ size: 5, current: [], due, masteredPool: mastered, rand });
    expect(s).toHaveLength(5);
    expect(s[0].questionId).toBe("m1");
    expect(s.every((i) => i.kind === "review")).toBe(true);
  });

  it("first session ever is all current-topic questions", () => {
    const s = buildSession({ size: 10, current, due: [], masteredPool: [], rand });
    expect(s.every((i) => i.kind === "learn")).toBe(true);
  });

  it("prefers unseen, then missed, then least recently seen", () => {
    const qs = [
      q("seen-old", "t", { seen: 2, lastCorrect: true, lastSeenAt: 1 }),
      q("missed", "t", { seen: 1, lastCorrect: false, lastSeenAt: 5 }),
      q("unseen"),
      q("seen-new", "t", { seen: 1, lastCorrect: true, lastSeenAt: 9 }),
    ];
    expect(orderCurrentTopic(qs, rand).map((x) => x.questionId)).toEqual(["unseen", "missed", "seen-old", "seen-new"]);
  });
});
