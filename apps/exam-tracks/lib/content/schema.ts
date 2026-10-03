import { z } from "zod";

export const STATUSES = ["draft", "source-checked", "human-verified"] as const;
export type Status = (typeof STATUSES)[number];

export const sourceSchema = z.object({
  /** Public URL of the specific doc section (with #anchor where possible). */
  url: z.string().url(),
  /** Short label for the section, e.g. "Querying basics › Range vector selectors". */
  title: z.string().min(3),
  /** Where the text was actually read, e.g. a repo path@commit, when it differs from url. */
  readFrom: z.string().optional(),
});
export type Source = z.infer<typeof sourceSchema>;

const reviewFields = {
  sources: z.array(sourceSchema).min(1, "at least one source is required"),
  status: z.enum(STATUSES),
  reviewer: z.string().nullable().default(null),
  version: z.number().int().positive(),
};

export const optionSchema = z.object({
  id: z.string().regex(/^[a-z]$/),
  text: z.string().min(1),
  correct: z.boolean(),
  note: z.string().min(8, "every option needs a note explaining why it is right or wrong"),
});

export const questionSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    type: z.enum(["single", "multi"]),
    stem: z.string().min(10),
    /** Optional code/output shown under the stem (PromQL, /metrics, YAML). */
    code: z.string().optional(),
    codeLang: z.enum(["promql", "text", "yaml", "go", "python"]).optional(),
    options: z.array(optionSchema).min(2).max(6),
    explanation: z.string().min(20),
    hint: z.string().min(10),
    difficulty: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    tags: z.array(z.string()).default([]),
    /** Glossary terms this question relies on; each must be introduced by this or an earlier lesson. */
    uses: z.array(z.string()).default([]),
    ...reviewFields,
  })
  .superRefine((q, ctx) => {
    const correct = q.options.filter((o) => o.correct).length;
    if (correct === 0) ctx.addIssue({ code: "custom", message: "no correct answer" });
    if (q.type === "single" && correct !== 1)
      ctx.addIssue({ code: "custom", message: `single-choice question has ${correct} correct options` });
    if (q.type === "multi" && correct < 2)
      ctx.addIssue({ code: "custom", message: "multi-select question needs at least two correct options" });
    const ids = q.options.map((o) => o.id);
    if (new Set(ids).size !== ids.length) ctx.addIssue({ code: "custom", message: "duplicate option ids" });
  });
export type Question = z.infer<typeof questionSchema>;

export const lessonFrontmatterSchema = z.object({
  id: z.string(),
  title: z.string(),
  summary: z.string().min(10),
  analogy: z.string().min(20),
  keyPoints: z.array(z.string()).min(2),
  commonTrap: z.string().min(20),
  explainBack: z.object({ prompt: z.string().min(10), modelAnswer: z.string().min(30) }),
  /** Glossary terms this lesson explains. */
  introduces: z.array(z.string()).default([]),
  /** Optional version notes, e.g. Prometheus 2.x vs 3.x behaviour differences. */
  versionNotes: z.array(z.string()).default([]),
  ...reviewFields,
});
export type LessonFrontmatter = z.infer<typeof lessonFrontmatterSchema>;
export type Lesson = LessonFrontmatter & { body: string };

export const trackSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  title: z.string(),
  shortTitle: z.string(),
  kind: z.enum(["exam", "general"]),
  description: z.string(),
  disclaimer: z.string().optional(),
  curriculumSource: sourceSchema.optional(),
  /** Hosts content in this track may cite. The validator rejects anything else. */
  allowedSourceHosts: z.array(z.string()).min(1),
  exam: z
    .object({
      questions: z.number().int().positive(),
      minutes: z.number().int().positive(),
      passPercent: z.number().min(1).max(100),
      /** Logistics confirmed against the official exam page? */
      verified: z.boolean(),
      note: z.string(),
    })
    .optional(),
  mastery: z.object({ runTarget: z.number().int().min(1).default(10) }).default({ runTarget: 10 }),
  readiness: z
    .object({ domainThreshold: z.number().min(0).max(1).default(0.8), recentWindow: z.number().int().default(30) })
    .default({ domainThreshold: 0.8, recentWindow: 30 }),
  domains: z
    .array(
      z.object({
        id: z.string(),
        title: z.string(),
        weight: z.number().min(0).max(100),
      }),
    )
    .min(1),
  /** Topics in learning order. Each topic belongs to one domain and covers one curriculum item. */
  topics: z
    .array(
      z.object({
        id: z.string().regex(/^[a-z0-9-]+$/),
        domain: z.string(),
        curriculumItem: z.string(),
        title: z.string(),
      }),
    )
    .min(1),
});
export type Track = z.infer<typeof trackSchema>;
