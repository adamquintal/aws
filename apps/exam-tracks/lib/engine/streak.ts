/**
 * Forgiving streak: a single missed day never breaks it; two missed days in a
 * row do. The streak counts study days in the unbroken chain.
 */
import { addDays, daysBetween } from "./dates";

export type Streak = { current: number; longest: number; graceUsedToday: boolean; studiedToday: boolean };

export function computeStreak(studyDays: string[], today: string): Streak {
  const days = [...new Set(studyDays)].filter((d) => d <= today).sort();
  if (!days.length) return { current: 0, longest: 0, graceUsedToday: false, studiedToday: false };

  let longest = 1;
  let run = 1;
  for (let i = 1; i < days.length; i++) {
    run = daysBetween(days[i - 1], days[i]) <= 2 ? run + 1 : 1;
    longest = Math.max(longest, run);
  }

  const last = days[days.length - 1];
  const gap = daysBetween(last, today);
  const alive = gap <= 2; // studied today, yesterday, or the day before (one missed day forgiven)
  return {
    current: alive ? run : 0,
    longest,
    studiedToday: gap === 0,
    // Yesterday was missed but the streak lives on, if they study today.
    graceUsedToday: alive && gap === 2,
  };
}

export { addDays };
