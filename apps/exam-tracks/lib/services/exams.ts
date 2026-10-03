import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { LoadedExamQuestion, LoadedTrack } from "@/lib/content/load";
import {
  assembleDiagnostic,
  assembleMock,
  examBlueprint,
  gradeExam,
  mulberry32,
  type Confidence,
  type ExamAnswers,
  type ExamResult,
} from "@/lib/engine/exam";

export type ExamKind = "diagnostic" | "mock";
export const DIAGNOSTIC_PER_DOMAIN = 5;
/** Answers saved within this long after the deadline still count (network lag, auto-submit). */
const GRACE_MS = 60_000;

export type PublicExamQuestion = {
  id: string;
  topicId: string;
  topicTitle: string;
  domainId: string;
  type: "single" | "multi";
  stem: string;
  code?: string;
  codeLang?: string;
  options: { id: string; text: string }[];
};

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Option order is shuffled but stable per attempt, so a refresh doesn't reshuffle. */
function toPublic(track: LoadedTrack, q: LoadedExamQuestion, attemptId: string): PublicExamQuestion {
  const rng = mulberry32(hash(`${attemptId}:${q.id}`));
  const options = [...q.options];
  for (let i = options.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [options[i], options[j]] = [options[j], options[i]];
  }
  return {
    id: q.id,
    topicId: q.topic,
    topicTitle: track.topics.find((t) => t.id === q.topic)?.title ?? q.topic,
    domainId: q.domain,
    type: q.type,
    stem: q.stem,
    code: q.code,
    codeLang: q.codeLang,
    options: options.map((o) => ({ id: o.id, text: o.text })),
  };
}

export function mockSize(track: LoadedTrack) {
  const total = track.exam?.questions ?? 60;
  const counts = examBlueprint(track.domains, total);
  const available = Object.entries(counts).reduce((s, [d, n]) => s + Math.min(n, track.examPool.filter((q) => q.domain === d).length), 0);
  return { questions: available, minutes: Math.round(((track.exam?.minutes ?? 90) * available) / total) };
}

export function deadline(a: { startedAt: Date; timeLimitSec: number | null }): Date | null {
  return a.timeLimitSec ? new Date(a.startedAt.getTime() + a.timeLimitSec * 1000) : null;
}

/** Resume an open attempt of this kind, or assemble a new one. */
export async function startExam(userId: string, track: LoadedTrack, kind: ExamKind) {
  const open = await prisma.examAttempt.findFirst({
    where: { userId, trackId: track.id, kind, submittedAt: null },
    orderBy: { startedAt: "desc" },
  });
  if (open) {
    const end = deadline(open);
    if (!end || end.getTime() + GRACE_MS > Date.now()) return open.id;
    await submitExam(userId, track, open.id); // time ran out while away: grade what was saved
  }

  const past = await prisma.examAttempt.findMany({ where: { userId, trackId: track.id }, select: { questionIds: true } });
  const seen = new Map<string, number>();
  past.forEach((p) => p.questionIds.forEach((id) => seen.set(id, (seen.get(id) ?? 0) + 1)));
  const pool = track.examPool.map((q) => ({ id: q.id, domain: q.domain, topic: q.topic }));
  const rng = mulberry32(Date.now() ^ hash(userId));

  let questionIds: string[];
  let timeLimitSec: number | null = null;
  if (kind === "mock") {
    questionIds = assembleMock({ pool, counts: examBlueprint(track.domains, track.exam?.questions ?? 60), seen, rng });
    timeLimitSec = mockSize(track).minutes * 60;
  } else {
    questionIds = assembleDiagnostic({
      pool,
      domains: track.domains.map((d) => d.id),
      perDomain: DIAGNOSTIC_PER_DOMAIN,
      topicOrder: track.topics.map((t) => t.id),
      rng,
    });
  }
  if (!questionIds.length) throw new Error("This track has no exam questions yet.");

  const versions = questionIds.map((id) => track.examPool.find((q) => q.id === id)!.version);
  const created = await prisma.examAttempt.create({
    data: { userId, trackId: track.id, kind, questionIds, questionVersions: versions, timeLimitSec },
  });
  return created.id;
}

export async function getAttempt(userId: string, track: LoadedTrack, id: string) {
  const a = await prisma.examAttempt.findFirst({ where: { id, userId, trackId: track.id } });
  if (!a) return null;
  const questions = a.questionIds
    .map((qid) => track.examPool.find((q) => q.id === qid))
    .filter((q): q is LoadedExamQuestion => !!q);
  return { attempt: a, questions };
}

export function publicQuestions(track: LoadedTrack, attemptId: string, qs: LoadedExamQuestion[]) {
  return qs.map((q) => toPublic(track, q, attemptId));
}

const CONF = new Set<Confidence>(["sure", "think", "guess"]);

/** Keep only answers to this attempt's questions, with valid option ids. */
function sanitize(answers: unknown, qs: LoadedExamQuestion[]): ExamAnswers {
  const out: ExamAnswers = {};
  if (!answers || typeof answers !== "object") return out;
  for (const q of qs) {
    const a = (answers as Record<string, { selected?: unknown; confidence?: unknown; flagged?: unknown }>)[q.id];
    if (!a) continue;
    const valid = new Set(q.options.map((o) => o.id));
    const selected = Array.isArray(a.selected) ? [...new Set(a.selected.filter((s): s is string => typeof s === "string" && valid.has(s)))] : [];
    out[q.id] = {
      selected: q.type === "single" ? selected.slice(0, 1) : selected,
      ...(CONF.has(a.confidence as Confidence) ? { confidence: a.confidence as Confidence } : {}),
      ...(a.flagged === true ? { flagged: true } : {}),
    };
  }
  return out;
}

export async function saveProgress(userId: string, track: LoadedTrack, id: string, answers: unknown) {
  const found = await getAttempt(userId, track, id);
  if (!found || found.attempt.submittedAt) return { ok: false as const, reason: "closed" };
  const end = deadline(found.attempt);
  if (end && Date.now() > end.getTime() + GRACE_MS) return { ok: false as const, reason: "time" };
  await prisma.examAttempt.update({ where: { id }, data: { answers: sanitize(answers, found.questions) as Prisma.InputJsonValue } });
  return { ok: true as const };
}

export async function submitExam(userId: string, track: LoadedTrack, id: string, answers?: unknown) {
  const found = await getAttempt(userId, track, id);
  if (!found) throw new Error("Exam not found");
  const { attempt, questions } = found;
  if (attempt.submittedAt) return attempt.id;

  // Late answers (after deadline + grace) are ignored; the last autosave stands.
  const end = deadline(attempt);
  const late = end && Date.now() > end.getTime() + GRACE_MS;
  const final = answers !== undefined && !late ? sanitize(answers, questions) : sanitize(attempt.answers, questions);

  const passPercent = track.exam?.passPercent ?? 75;
  const result = gradeExam({
    items: questions.map((q) => ({ id: q.id, domain: q.domain, topic: q.topic, options: q.options })),
    answers: final,
    blueprint: examBlueprint(track.domains, track.exam?.questions ?? 60),
    passPercent,
    rng: mulberry32(hash(attempt.id)),
  });

  const priors = await prisma.attempt.findMany({ where: { userId, questionId: { in: questions.map((q) => q.id) } }, select: { questionId: true } });
  const seenBefore = new Set(priors.map((p) => p.questionId));
  const now = new Date();
  await prisma.$transaction([
    // Per-question rows feed the admin question-quality stats; practice views exclude these contexts.
    prisma.attempt.createMany({
      data: questions
        .filter((q) => final[q.id]?.selected.length)
        .map((q) => ({
          userId, trackId: track.id, topicId: q.topic, domainId: q.domain, questionId: q.id, questionVersion: q.version,
          selected: final[q.id].selected, correct: result.perQuestion[q.id].correct, firstAttempt: !seenBefore.has(q.id),
          context: attempt.kind, createdAt: now,
        })),
    }),
    prisma.examAttempt.update({
      where: { id },
      data: {
        answers: final as Prisma.InputJsonValue,
        submittedAt: now,
        scorePercent: result.percent,
        passed: attempt.kind === "mock" ? result.percent >= passPercent : null,
        result: result as unknown as Prisma.InputJsonValue,
      },
    }),
  ]);
  return attempt.id;
}

export type ExamSummary = {
  id: string;
  kind: ExamKind;
  startedAt: Date;
  submittedAt: Date | null;
  scorePercent: number | null;
  passed: boolean | null;
  total: number;
  questionIds: string[];
  estimate: ExamResult["estimate"] | null;
};

export async function listExams(userId: string, track: LoadedTrack): Promise<ExamSummary[]> {
  const rows = await prisma.examAttempt.findMany({ where: { userId, trackId: track.id }, orderBy: { startedAt: "desc" }, take: 50 });
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind as ExamKind,
    startedAt: r.startedAt,
    submittedAt: r.submittedAt,
    scorePercent: r.scorePercent,
    passed: r.passed,
    total: r.questionIds.length,
    questionIds: r.questionIds,
    estimate: (r.result as ExamResult | null)?.estimate ?? null,
  }));
}

/** Latest submitted pre-course check, for highlighting weak areas on the path and home screen. */
export async function latestDiagnostic(userId: string, trackId: string) {
  const row = await prisma.examAttempt.findFirst({
    where: { userId, trackId, kind: "diagnostic", submittedAt: { not: null } },
    orderBy: { submittedAt: "desc" },
  });
  return row ? { id: row.id, submittedAt: row.submittedAt!, result: row.result as unknown as ExamResult } : null;
}
