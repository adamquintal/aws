import { describe, it, expect } from "vitest";
import { projectReadyDate, REVIEW_BUFFER_DAYS } from "@/lib/engine/projection";
import { addDays } from "@/lib/engine/dates";

describe("projected ready date", () => {
  it("is unknown without enough history", () => {
    const p = projectReadyDate({ today: "2026-10-03", startedDay: "2026-10-01", masteredDays: ["2026-10-02"], totalTopics: 26, examDay: null });
    expect(p.projectedReadyDay).toBeNull();
    expect(p.outlook).toBe("unknown");
  });

  it("projects from recent pace plus a review buffer", () => {
    // 4 topics in the last 28 days -> 1 per week; 6 remaining -> 42 days + buffer
    const masteredDays = ["2026-09-08", "2026-09-15", "2026-09-22", "2026-09-29"];
    const p = projectReadyDate({ today: "2026-10-05", startedDay: "2026-08-01", masteredDays, totalTopics: 10, examDay: null });
    expect(p.pacePerWeek).toBe(1);
    expect(p.projectedReadyDay).toBe(addDays("2026-10-05", 42 + REVIEW_BUFFER_DAYS));
  });

  it("compares with the exam date", () => {
    const masteredDays = Array.from({ length: 14 }, (_, i) => addDays("2026-09-08", i * 2)); // 1 every 2 days
    const base = { today: "2026-10-05", startedDay: "2026-09-01", masteredDays, totalTopics: 20 };
    expect(projectReadyDate({ ...base, examDay: "2026-12-31" }).outlook).toBe("on-track");
    expect(projectReadyDate({ ...base, examDay: "2026-10-10" }).outlook).toBe("behind");
  });

  it("reports the pace needed for an exam date", () => {
    const p = projectReadyDate({ today: "2026-10-01", startedDay: "2026-10-01", masteredDays: [], totalTopics: 26, examDay: addDays("2026-10-01", 7 + 91) });
    expect(p.neededPerWeek).toBe(2);
  });

  it("everything mastered means ready after the buffer", () => {
    const p = projectReadyDate({ today: "2026-10-01", startedDay: "2026-09-01", masteredDays: ["2026-09-30"], totalTopics: 1, examDay: null });
    expect(p.projectedReadyDay).toBe(addDays("2026-10-01", REVIEW_BUFFER_DAYS));
  });
});
