import "server-only";
import { prisma } from "@/lib/db";
import type { LoadedTrack } from "@/lib/content/load";
import { computeReadiness, sinceDayOne, weakestTopics, type DomainDef } from "@/lib/engine/readiness";
import { computeStreak } from "@/lib/engine/streak";
import { projectReadyDate } from "@/lib/engine/projection";
import { dayKey } from "@/lib/engine/dates";
import { loadGates, statusesFor } from "./learning";

const isPractice = (context: string) => context !== "mock" && context !== "diagnostic";

export function domainDefs(track: LoadedTrack): DomainDef[] {
  return track.domains.map((d) => ({ ...d, topicIds: track.topics.filter((t) => t.domain === d.id).map((t) => t.id) }));
}

export async function getProgress(userId: string, timezone: string, track: LoadedTrack, enrollment: { startedAt: Date; examDate: Date | null }) {
  const now = new Date();
  const today = dayKey(now, timezone);
  const [attempts, gates, studyDays, dueCount, snapshots, passedMock] = await Promise.all([
    prisma.attempt.findMany({
      where: { userId, trackId: track.id },
      select: { domainId: true, topicId: true, correct: true, firstAttempt: true, createdAt: true, context: true },
    }),
    loadGates(userId, track),
    prisma.studyDay.findMany({ where: { userId, trackId: track.id }, orderBy: { day: "asc" } }),
    prisma.reviewCard.count({ where: { userId, trackId: track.id, dueAt: { lte: now } } }),
    prisma.readinessSnapshot.findMany({ where: { userId, trackId: track.id }, orderBy: { day: "asc" }, take: 120 }),
    prisma.examAttempt.findFirst({ where: { userId, trackId: track.id, kind: "mock", passed: true }, select: { id: true } }),
  ]);

  const statuses = statusesFor(track, gates);
  const mastered = new Set([...gates].filter(([, g]) => g.masteredAt).map(([id]) => id));
  const domains = domainDefs(track);
  const readiness = computeReadiness({
    domains,
    attempts,
    mastered,
    mockPassed: !!passedMock,
    threshold: track.readiness.domainThreshold,
    recentWindow: track.readiness.recentWindow,
    examHasMock: track.kind === "exam",
  });

  // Keep one readiness snapshot per day for the trend chart.
  await prisma.readinessSnapshot.upsert({
    where: { userId_trackId_day: { userId, trackId: track.id, day: today } },
    create: { userId, trackId: track.id, day: today, score: readiness.score, byDomain: readiness.domains.map((d) => ({ id: d.domainId, score: d.score })) },
    update: { score: readiness.score, byDomain: readiness.domains.map((d) => ({ id: d.domainId, score: d.score })) },
  });
  const trend = [...snapshots.filter((s) => s.day !== today).map((s) => ({ day: s.day, score: s.score })), { day: today, score: readiness.score }];

  const topicAccuracy = track.topics.map((t) => {
    const xs = attempts.filter((a) => a.topicId === t.id && isPractice(a.context));
    return { topicId: t.id, title: t.title, domain: t.domain, status: statuses.get(t.id)!, attempts: xs.length, accuracy: xs.length ? xs.filter((a) => a.correct).length / xs.length : null };
  });

  const masteredDays = [...gates.values()].filter((g) => g.masteredAt).map((g) => dayKey(g.masteredAt!, timezone));
  const projection = projectReadyDate({
    today,
    startedDay: dayKey(enrollment.startedAt, timezone),
    masteredDays,
    totalTopics: track.topics.length,
    examDay: enrollment.examDate ? enrollment.examDate.toISOString().slice(0, 10) : null,
  });

  return {
    today,
    readiness,
    trend,
    streak: computeStreak(studyDays.map((d) => d.day), today),
    studyDays: studyDays.map((d) => ({ day: d.day, answered: d.answered, correct: d.correct, activeMs: d.activeMs })),
    totalActiveMs: studyDays.reduce((s, d) => s + d.activeMs, 0),
    dueCount,
    masteredCount: mastered.size,
    totalTopics: track.topics.length,
    topicAccuracy,
    weakest: weakestTopics(attempts.filter((a) => isPractice(a.context))).map((w) => ({ ...w, title: track.topics.find((t) => t.id === w.topicId)?.title ?? w.topicId })),
    sinceDayOne: sinceDayOne(domains, attempts.filter((a) => isPractice(a.context)), track.readiness.recentWindow),
    projection,
    statuses,
    gates,
  };
}
