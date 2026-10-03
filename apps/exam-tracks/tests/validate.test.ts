import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { validateAll } from "@/lib/content/validate";

let root: string;
const src = [{ url: "https://prometheus.io/docs/concepts/data_model/", title: "Data model" }];
const track = {
  id: "t", title: "T", shortTitle: "T", kind: "general", description: "d",
  allowedSourceHosts: ["prometheus.io"],
  domains: [{ id: "d1", title: "D1", weight: 100 }],
  topics: [{ id: "one", domain: "d1", curriculumItem: "One", title: "One" }, { id: "two", domain: "d1", curriculumItem: "Two", title: "Two" }],
};
const lesson = (id: string, introduces: string[]) => `---
id: ${id}
title: Lesson ${id}
summary: A short summary here.
analogy: An everyday analogy that is long enough.
keyPoints: [one, two]
commonTrap: A common trap that is long enough to pass.
explainBack: { prompt: "Explain it in your words", modelAnswer: "A model answer that is comfortably long enough." }
introduces: [${introduces.join(", ")}]
sources: [{ url: "https://prometheus.io/docs/concepts/data_model/", title: "Data model" }]
status: source-checked
reviewer: null
version: 1
---
Body.`;
const q = (over: Record<string, unknown> = {}) => ({
  id: "q1", type: "single", stem: "Which one is right?",
  options: [
    { id: "a", text: "A", correct: true, note: "Because it is right." },
    { id: "b", text: "B", correct: false, note: "Because it is wrong." },
  ],
  explanation: "An explanation that is long enough.", hint: "A gentle hint.", difficulty: 1,
  tags: [], uses: [], sources: src, status: "source-checked", reviewer: null, version: 1, ...over,
});

function write(files: Record<string, unknown>) {
  for (const [rel, body] of Object.entries(files)) {
    const f = path.join(root, rel);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, typeof body === "string" ? body : JSON.stringify(body));
  }
}
const errors = () => validateAll(root).filter((i) => i.level === "error").map((i) => i.message).join("\n");

beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), "content-")); });
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe("content validation", () => {
  it("accepts a valid track", () => {
    write({ "t/track.json": track, "t/topics/one/lesson.mdx": lesson("one", ["alpha"]), "t/topics/one/questions.json": [q({ uses: ["alpha"] })] });
    expect(errors()).toBe("");
  });

  it("fails when a question has no source", () => {
    write({ "t/track.json": track, "t/topics/one/lesson.mdx": lesson("one", []), "t/topics/one/questions.json": [q({ sources: [] })] });
    expect(errors()).toMatch(/at least one source/);
  });

  it("fails when there is no correct answer", () => {
    const opts = [{ id: "a", text: "A", correct: false, note: "Because it is wrong." }, { id: "b", text: "B", correct: false, note: "Because it is wrong." }];
    write({ "t/track.json": track, "t/topics/one/lesson.mdx": lesson("one", []), "t/topics/one/questions.json": [q({ options: opts })] });
    expect(errors()).toMatch(/no correct answer/);
  });

  it("fails when an option note is missing", () => {
    const opts = [{ id: "a", text: "A", correct: true, note: "" }, { id: "b", text: "B", correct: false, note: "Because it is wrong." }];
    write({ "t/track.json": track, "t/topics/one/lesson.mdx": lesson("one", []), "t/topics/one/questions.json": [q({ options: opts })] });
    expect(errors()).toMatch(/note/);
  });

  it("fails when a term is used before a lesson introduces it", () => {
    write({
      "t/track.json": track,
      "t/topics/one/lesson.mdx": lesson("one", ["alpha"]),
      "t/topics/one/questions.json": [q({ uses: ["beta"] })],
      "t/topics/two/lesson.mdx": lesson("two", ["beta"]),
    });
    expect(errors()).toMatch(/uses term "beta" before any lesson introduces it/);
  });

  it("fails on sources outside the allowed hosts", () => {
    write({ "t/track.json": track, "t/topics/one/lesson.mdx": lesson("one", []), "t/topics/one/questions.json": [q({ sources: [{ url: "https://example.com/dump", title: "Somewhere" }] })] });
    expect(errors()).toMatch(/not on an allowed host/);
  });

  it("fails when human-verified has no reviewer", () => {
    write({ "t/track.json": track, "t/topics/one/lesson.mdx": lesson("one", []), "t/topics/one/questions.json": [q({ status: "human-verified" })] });
    expect(errors()).toMatch(/must name a reviewer/);
  });

  it("fails on single-choice questions with two correct answers", () => {
    const opts = [{ id: "a", text: "A", correct: true, note: "Because it is right." }, { id: "b", text: "B", correct: true, note: "Because it is right." }];
    write({ "t/track.json": track, "t/topics/one/lesson.mdx": lesson("one", []), "t/topics/one/questions.json": [q({ options: opts })] });
    expect(errors()).toMatch(/single-choice question has 2 correct/);
  });

  it("fails on options that depend on display position (options are shuffled)", () => {
    const opts = [
      { id: "a", text: "A", correct: true, note: "Because it is right." },
      { id: "b", text: "B", correct: true, note: "Because it is right." },
      { id: "c", text: "All of the above", correct: false, note: "Because it is wrong." },
    ];
    write({ "t/track.json": track, "t/topics/one/lesson.mdx": lesson("one", []), "t/topics/one/questions.json": [q({ type: "multi", options: opts })] });
    expect(errors()).toMatch(/depends on position/);
  });

  it("fails when domain weights don't add up to 100", () => {
    write({ "t/track.json": { ...track, domains: [{ id: "d1", title: "D1", weight: 90 }] } });
    expect(errors()).toMatch(/sum to 90/);
  });

  it("the real content passes", () => {
    expect(validateAll().filter((i) => i.level === "error")).toEqual([]);
  });
});
