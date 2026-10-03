import { describe, it, expect } from "vitest";
import { gradeAnswer } from "@/lib/engine/grading";

const single = [{ id: "a", correct: false }, { id: "b", correct: true }, { id: "c", correct: false }];
const multi = [{ id: "a", correct: true }, { id: "b", correct: true }, { id: "c", correct: false }];

describe("grading", () => {
  it("single choice", () => {
    expect(gradeAnswer(single, ["b"])).toBe(true);
    expect(gradeAnswer(single, ["a"])).toBe(false);
  });
  it("multi-select requires the exact set", () => {
    expect(gradeAnswer(multi, ["b", "a"])).toBe(true);
    expect(gradeAnswer(multi, ["a"])).toBe(false); // partial
    expect(gradeAnswer(multi, ["a", "b", "c"])).toBe(false); // extra
    expect(gradeAnswer(multi, ["a", "a", "b"])).toBe(true); // duplicates ignored
  });
  it("empty selection is wrong", () => {
    expect(gradeAnswer(single, [])).toBe(false);
  });
});
