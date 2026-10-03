import { describe, it, expect } from "vitest";
import { computeStreak } from "@/lib/engine/streak";
import { dayKey } from "@/lib/engine/dates";

describe("forgiving streak", () => {
  it("counts consecutive study days", () => {
    expect(computeStreak(["2026-10-01", "2026-10-02", "2026-10-03"], "2026-10-03")).toMatchObject({ current: 3, studiedToday: true });
  });

  it("one missed day does not break it", () => {
    const s = computeStreak(["2026-10-01", "2026-10-03", "2026-10-04"], "2026-10-04");
    expect(s.current).toBe(3);
  });

  it("is still alive today if yesterday was missed (grace)", () => {
    const s = computeStreak(["2026-10-01", "2026-10-02"], "2026-10-04");
    expect(s).toMatchObject({ current: 2, graceUsedToday: true, studiedToday: false });
  });

  it("two missed days in a row break it", () => {
    expect(computeStreak(["2026-10-01", "2026-10-02"], "2026-10-05").current).toBe(0);
    expect(computeStreak(["2026-10-01", "2026-10-04", "2026-10-05"], "2026-10-05").current).toBe(2);
  });

  it("tracks the longest streak", () => {
    expect(computeStreak(["2026-09-01", "2026-09-02", "2026-09-04", "2026-09-20"], "2026-09-20").longest).toBe(3);
  });

  it("handles no history and duplicates", () => {
    expect(computeStreak([], "2026-10-01").current).toBe(0);
    expect(computeStreak(["2026-10-01", "2026-10-01"], "2026-10-01").current).toBe(1);
  });

  it("uses the learner's timezone for day boundaries", () => {
    const d = new Date("2026-10-02T02:00:00Z");
    expect(dayKey(d, "UTC")).toBe("2026-10-02");
    expect(dayKey(d, "America/New_York")).toBe("2026-10-01");
  });
});
