/**
 * Builds a daily session (~10 questions): a short warm-up from mastered
 * topics, then due reviews, then the current topic. Pure: callers pass in
 * everything; `rand` is injectable for deterministic tests.
 */

export type SessionKind = "warmup" | "review" | "learn";
export type SessionItem = { questionId: string; topicId: string; kind: SessionKind };

export type QuestionStat = { questionId: string; topicId: string; seen: number; lastCorrect: boolean | null; lastSeenAt: number | null };

export type SessionInput = {
  size: number;
  /** Questions in the current topic (empty if nothing is unlocked to learn). */
  current: QuestionStat[];
  /** Due review cards, most overdue first. */
  due: { questionId: string; topicId: string }[];
  /** All questions from mastered topics, for warm-up. */
  masteredPool: { questionId: string; topicId: string }[];
  rand?: () => number;
};

export const SESSION_DEFAULTS = { warmup: 2, maxReviewsWithCurrent: 3 };

function shuffle<T>(arr: T[], rand: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Unseen first, then last-missed, then least recently seen. */
export function orderCurrentTopic(qs: QuestionStat[], rand: () => number = Math.random): QuestionStat[] {
  const rank = (q: QuestionStat) => (q.seen === 0 ? 0 : q.lastCorrect === false ? 1 : 2);
  return shuffle(qs, rand).sort((a, b) => rank(a) - rank(b) || (a.lastSeenAt ?? 0) - (b.lastSeenAt ?? 0));
}

export function buildSession(input: SessionInput): SessionItem[] {
  const rand = input.rand ?? Math.random;
  const used = new Set<string>();
  const out: SessionItem[] = [];
  const push = (questionId: string, topicId: string, kind: SessionKind) => {
    if (out.length >= input.size || used.has(questionId)) return false;
    used.add(questionId);
    out.push({ questionId, topicId, kind });
    return true;
  };

  const hasCurrent = input.current.length > 0;
  const dueIds = new Set(input.due.map((d) => d.questionId));

  // 1. Warm-up: easy confidence builders from mastered topics that are not already due.
  if (hasCurrent) {
    const warm = shuffle(input.masteredPool.filter((q) => !dueIds.has(q.questionId)), rand);
    for (const q of warm.slice(0, SESSION_DEFAULTS.warmup)) push(q.questionId, q.topicId, "warmup");
  }

  // 2. Due reviews. Cap them when there is a current topic so new learning still happens;
  //    the rest wait calmly for tomorrow.
  const reviewCap = hasCurrent ? SESSION_DEFAULTS.maxReviewsWithCurrent : input.size;
  let reviews = 0;
  for (const d of input.due) {
    if (reviews >= reviewCap) break;
    if (push(d.questionId, d.topicId, "review")) reviews++;
  }

  // 3. Current topic fills the rest.
  for (const q of orderCurrentTopic(input.current, rand)) push(q.questionId, q.topicId, "learn");

  // 4. Nothing new to learn: top up with more mastered-topic practice.
  if (!hasCurrent) for (const q of shuffle(input.masteredPool, rand)) push(q.questionId, q.topicId, "review");

  return out;
}
