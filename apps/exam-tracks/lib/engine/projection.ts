/**
 * Projected ready date from recent pace. Deliberately simple and explained in
 * the UI: topics mastered per day over the last few weeks, plus a buffer for
 * final review and a mock exam.
 */
import { addDays, daysBetween } from "./dates";

export type Projection = {
  pacePerWeek: number; // topics per week
  remainingTopics: number;
  projectedReadyDay: string | null; // null = not enough data yet
  examDay: string | null;
  /** "on-track" | "tight" | "behind" | "unknown" */
  outlook: "on-track" | "tight" | "behind" | "unknown";
  /** Topics per week needed to be ready a week before the exam. */
  neededPerWeek: number | null;
};

export const REVIEW_BUFFER_DAYS = 7;
const PACE_WINDOW_DAYS = 28;

export function projectReadyDate(opts: {
  today: string;
  startedDay: string;
  masteredDays: string[]; // day each topic was mastered
  totalTopics: number;
  examDay: string | null;
}): Projection {
  const { today, startedDay, masteredDays, totalTopics, examDay } = opts;
  const remainingTopics = Math.max(0, totalTopics - masteredDays.length);

  const elapsed = Math.max(1, Math.min(PACE_WINDOW_DAYS, daysBetween(startedDay, today) + 1));
  const windowStart = addDays(today, -elapsed + 1);
  const recent = masteredDays.filter((d) => d >= windowStart && d <= today).length;
  // Need at least a week of history or one mastered topic before projecting.
  const enoughData = recent > 0 && daysBetween(startedDay, today) >= 6;
  const perDay = recent / elapsed;

  let projectedReadyDay: string | null = null;
  if (remainingTopics === 0) projectedReadyDay = addDays(today, REVIEW_BUFFER_DAYS);
  else if (enoughData && perDay > 0) projectedReadyDay = addDays(today, Math.ceil(remainingTopics / perDay) + REVIEW_BUFFER_DAYS);

  let outlook: Projection["outlook"] = "unknown";
  let neededPerWeek: number | null = null;
  if (examDay) {
    const daysLeft = daysBetween(today, examDay) - REVIEW_BUFFER_DAYS;
    neededPerWeek = daysLeft > 0 ? round1((remainingTopics / daysLeft) * 7) : null;
    if (projectedReadyDay) {
      const slack = daysBetween(projectedReadyDay, examDay);
      outlook = slack >= 7 ? "on-track" : slack >= 0 ? "tight" : "behind";
    }
  }
  return { pacePerWeek: round1(perDay * 7), remainingTopics, projectedReadyDay, examDay, outlook, neededPerWeek };
}

const round1 = (n: number) => Math.round(n * 10) / 10;
