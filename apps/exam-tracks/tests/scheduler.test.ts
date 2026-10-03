import { describe, it, expect } from "vitest";
import { LeitnerScheduler, getScheduler, outcomeOf, registerScheduler, type Scheduler } from "@/lib/engine/scheduler";

const now = new Date("2026-10-01T00:00:00Z");
const days = (d: Date) => Math.round((d.getTime() - now.getTime()) / 86_400_000);

describe("Leitner scheduler (1, 3, 7, 21 days)", () => {
  const s = new LeitnerScheduler();

  it("climbs boxes on unaided correct answers", () => {
    let st = s.initial();
    const intervals: number[] = [];
    for (let i = 0; i < 5; i++) {
      const r = s.next(st, "good", now);
      st = r.state;
      intervals.push(days(r.dueAt));
    }
    expect(intervals).toEqual([1, 3, 7, 21, 21]); // caps at the last box
  });

  it("a miss sends the card back to box 1 (tomorrow)", () => {
    const r = s.next({ box: 4 }, "again", now);
    expect(r.state.box).toBe(1);
    expect(days(r.dueAt)).toBe(1);
  });

  it("a hinted correct answer keeps the card in its box", () => {
    expect(s.next({ box: 3 }, "hard", now).state.box).toBe(3);
    expect(s.next({ box: 0 }, "hard", now).state.box).toBe(1);
  });

  it("maps answers to outcomes", () => {
    expect(outcomeOf(false, false)).toBe("again");
    expect(outcomeOf(false, true)).toBe("again");
    expect(outcomeOf(true, true)).toBe("hard");
    expect(outcomeOf(true, false)).toBe("good");
  });

  it("is swappable through the registry", () => {
    const fixed: Scheduler<{ n: number }> = {
      id: "fixed",
      initial: () => ({ n: 0 }),
      next: (st, _o, at) => ({ state: { n: st.n + 1 }, dueAt: new Date(at.getTime() + 86_400_000) }),
    };
    registerScheduler(fixed);
    expect(getScheduler("fixed").next({ n: 1 }, "good", now).state).toEqual({ n: 2 });
    expect(getScheduler().id).toBe("leitner");
    expect(() => getScheduler("nope")).toThrow();
  });
});
