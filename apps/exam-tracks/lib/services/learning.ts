import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { findQuestion, type LoadedTrack } from "@/lib/content/load";
import type { Question } from "@/lib/content/schema";
import { applyAnswer, completeExplainBack, emptyGate, topicStatuses, type GateState, type TopicStatus } from "@/lib/engine/mastery";
import { getScheduler, outcomeOf } from "@/lib/engine/scheduler";
import { buildSession, type SessionItem, type SessionKind } from "@/lib/engine/session";
import { dayKey } from "@/lib/engine/dates";
import { gradeAnswer } from "@/lib/engine/grading";

const SESSION_SIZE = 10;
const MAX_COUNTED_MS = 5 * 60_000; // cap time per answer so idle tabs don't inflate "time studied"

/** Question as sent to the browser before answering: no correctness, no notes. */
export type PublicQuestion = {
  id: string;
  version: number;
  topicId: string;
  topicTitle: string;
  type: Question["type"];
  stem: string;
  code?: string;
  codeLang?: string;
  options: { id: string; text: string }[];
  hint: string;
};

function shuffled<T>(xs: T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function toPublic(track: LoadedTrack, q: Question): PublicQuestion {
  const topic = track.topics.find((t) => t.questions.some((x) => x.id === q.id))!;
  return {
    id: q.id,
    version: q.version,
    topicId: topic.id,
    topicTitle: topic.title,
    type: q.type,
    stem: q.stem,
    code: q.code,
    codeLang: q.codeLang,
    // Shuffle display order so the correct answer's position carries no signal.
    options: shuffled(q.options).map((o) => ({ id: o.id, text: o.text })),
    hint: q.hint,
  };
}

export async function loadGates(userId: string, track: LoadedTrack): Promise<Map<string, GateState & { lessonViewedAt: Date | null }>> {
  const rows = await prisma.topicProgress.findMany({ where: { userId, trackId: track.id } });
  return new Map(rows.map((r) => [r.topicId, { run: r.run, bestRun: r.bestRun, gateReachedAt: r.gateReachedAt, masteredAt: r.masteredAt, lessonViewedAt: r.lessonViewedAt }]));
}

export function statusesFor(track: LoadedTrack, gates: Map<string, GateState>): Map<string, TopicStatus> {
  return topicStatuses(
    track.topics.map((t) => ({ id: t.id, hasContent: !!t.lesson && t.questions.length > 0 })),
    gates,
  );
}

export function currentTopic(track: LoadedTrack, statuses: Map<string, TopicStatus>) {
  return track.topics.find((t) => {
    const s = statuses.get(t.id);
    return s === "current" || s === "explain-back" || s === "coming-soon";
  });
}

export async function buildDailySession(userId: string, track: LoadedTrack, now = new Date()) {
  const gates = await loadGates(userId, track);
  const statuses = statusesFor(track, gates);
  const cur = currentTopic(track, statuses);
  const learnable = cur && statuses.get(cur.id) === "current" ? cur : null;

  const attempts = learnable
    ? await prisma.attempt.findMany({
        where: { userId, trackId: track.id, topicId: learnable.id },
        orderBy: { createdAt: "asc" },
        select: { questionId: true, correct: true, createdAt: true },
      })
    : [];
  const stats = new Map<string, { seen: number; lastCorrect: boolean | null; lastSeenAt: number | null }>();
  for (const a of attempts) {
    const s = stats.get(a.questionId) ?? { seen: 0, lastCorrect: null, lastSeenAt: null };
    stats.set(a.questionId, { seen: s.seen + 1, lastCorrect: a.correct, lastSeenAt: a.createdAt.getTime() });
  }

  const masteredTopics = track.topics.filter((t) => statuses.get(t.id) === "mastered");
  const masteredIds = new Set(masteredTopics.map((t) => t.id));
  const contentIds = new Set(track.topics.flatMap((t) => t.questions.map((q) => q.id)));
  const dueCards = await prisma.reviewCard.findMany({
    where: { userId, trackId: track.id, dueAt: { lte: now } },
    orderBy: { dueAt: "asc" },
    select: { questionId: true, topicId: true },
  });

  const items = buildSession({
    size: SESSION_SIZE,
    current: (learnable?.questions ?? []).map((q) => ({ questionId: q.id, topicId: learnable!.id, ...(stats.get(q.id) ?? { seen: 0, lastCorrect: null, lastSeenAt: null }) })),
    // Only review questions that still exist and belong to mastered topics (current-topic misses come back via the gate).
    due: dueCards.filter((c) => contentIds.has(c.questionId) && masteredIds.has(c.topicId)),
    masteredPool: masteredTopics.flatMap((t) => t.questions.map((q) => ({ questionId: q.id, topicId: t.id }))),
  });

  return {
    items: items.map((i) => ({ ...i, question: toPublic(track, findQuestion(track, i.questionId)!.question) })),
    currentTopic: cur ? { id: cur.id, title: cur.title, status: statuses.get(cur.id)! } : null,
    runTarget: track.mastery.runTarget,
    run: learnable ? gates.get(learnable.id)?.run ?? 0 : 0,
  };
}

export type SessionPayload = Awaited<ReturnType<typeof buildDailySession>>;
export type SessionEntry = SessionItem & { question: PublicQuestion };

export type Feedback = {
  correct: boolean;
  correctIds: string[];
  notes: Record<string, string>;
  explanation: string;
  sources: { url: string; title: string }[];
  gate: { event: string; run: number; runTarget: number; topicId: string } | null;
};

export async function recordAnswer(opts: {
  userId: string;
  timezone: string;
  track: LoadedTrack;
  questionId: string;
  selected: string[];
  hintUsed: boolean;
  durationMs: number;
  kind: SessionKind;
  now?: Date;
}): Promise<Feedback> {
  const now = opts.now ?? new Date();
  const { track, userId } = opts;
  const found = findQuestion(track, opts.questionId);
  if (!found) throw new Error("unknown question");
  const { question: q, topic } = found;
  const correct = gradeAnswer(q.options, opts.selected);
  const durationMs = Math.max(0, Math.min(MAX_COUNTED_MS, Math.round(opts.durationMs)));

  return prisma.$transaction(async (tx) => {
    const prior = await tx.attempt.count({ where: { userId, questionId: q.id } });
    await tx.attempt.create({
      data: {
        userId, trackId: track.id, topicId: topic.id, domainId: topic.domain, questionId: q.id, questionVersion: q.version,
        selected: opts.selected, correct, hintUsed: opts.hintUsed, firstAttempt: prior === 0, context: opts.kind, durationMs,
      },
    });

    // Mastery gate: only answers in the topic currently being learned move the run.
    const gateRows = await tx.topicProgress.findMany({ where: { userId, trackId: track.id } });
    const gates = new Map<string, GateState>(gateRows.map((r) => [r.topicId, r]));
    const statuses = statusesFor(track, gates);
    let gate: Feedback["gate"] = null;
    if (statuses.get(topic.id) === "current") {
      const before = gates.get(topic.id) ?? emptyGate();
      const { state, event } = applyAnswer(before, { correct, hintUsed: opts.hintUsed }, track.mastery.runTarget, now);
      await tx.topicProgress.upsert({
        where: { userId_trackId_topicId: { userId, trackId: track.id, topicId: topic.id } },
        create: { userId, trackId: track.id, topicId: topic.id, run: state.run, bestRun: state.bestRun, gateReachedAt: state.gateReachedAt },
        update: { run: state.run, bestRun: state.bestRun, gateReachedAt: state.gateReachedAt },
      });
      gate = { event, run: state.run, runTarget: track.mastery.runTarget, topicId: topic.id };
    }

    // Spaced repetition.
    const card = await tx.reviewCard.findUnique({ where: { userId_trackId_questionId: { userId, trackId: track.id, questionId: q.id } } });
    const scheduler = getScheduler(card?.scheduler ?? "leitner");
    const next = scheduler.next(card ? card.state : scheduler.initial(), outcomeOf(correct, opts.hintUsed), now);
    await tx.reviewCard.upsert({
      where: { userId_trackId_questionId: { userId, trackId: track.id, questionId: q.id } },
      create: { userId, trackId: track.id, questionId: q.id, topicId: topic.id, scheduler: scheduler.id, state: next.state as Prisma.InputJsonValue, dueAt: next.dueAt },
      update: { state: next.state as Prisma.InputJsonValue, dueAt: next.dueAt, topicId: topic.id },
    });

    // Study day.
    const day = dayKey(now, opts.timezone);
    await tx.studyDay.upsert({
      where: { userId_trackId_day: { userId, trackId: track.id, day } },
      create: { userId, trackId: track.id, day, answered: 1, correct: correct ? 1 : 0, activeMs: durationMs },
      update: { answered: { increment: 1 }, correct: { increment: correct ? 1 : 0 }, activeMs: { increment: durationMs } },
    });

    return {
      correct,
      correctIds: q.options.filter((o) => o.correct).map((o) => o.id),
      notes: Object.fromEntries(q.options.map((o) => [o.id, o.note])),
      explanation: q.explanation,
      sources: q.sources.map((s) => ({ url: s.url, title: s.title })),
      gate,
    };
  });
}

export async function submitExplainBack(opts: { userId: string; track: LoadedTrack; topicId: string; text: string; selfRating: string; now?: Date }) {
  const now = opts.now ?? new Date();
  const row = await prisma.topicProgress.findUnique({
    where: { userId_trackId_topicId: { userId: opts.userId, trackId: opts.track.id, topicId: opts.topicId } },
  });
  const state = completeExplainBack(row ?? emptyGate(), now); // throws if the gate wasn't reached
  await prisma.$transaction([
    prisma.explainBack.create({ data: { userId: opts.userId, trackId: opts.track.id, topicId: opts.topicId, text: opts.text, selfRating: opts.selfRating } }),
    prisma.topicProgress.update({
      where: { userId_trackId_topicId: { userId: opts.userId, trackId: opts.track.id, topicId: opts.topicId } },
      data: { masteredAt: state.masteredAt },
    }),
  ]);
}

export async function markLessonViewed(userId: string, trackId: string, topicId: string) {
  await prisma.topicProgress.upsert({
    where: { userId_trackId_topicId: { userId, trackId, topicId } },
    create: { userId, trackId, topicId, lessonViewedAt: new Date() },
    update: { lessonViewedAt: new Date() },
  });
}
