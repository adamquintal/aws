/**
 * Spaced repetition behind a small interface so Leitner can be swapped for
 * SM-2 (or anything else) later. Card state is opaque JSON stored per card.
 */
import { DAY_MS } from "./dates";

/** again = wrong; hard = right but needed a hint; good = right unaided. */
export type Outcome = "again" | "hard" | "good";

export interface Scheduler<S = unknown> {
  readonly id: string;
  initial(): S;
  next(state: S, outcome: Outcome, now: Date): { state: S; dueAt: Date };
}

export type LeitnerState = { box: number };

/** Leitner boxes. Box n is reviewed `intervals[n-1]` days after the last answer. */
export class LeitnerScheduler implements Scheduler<LeitnerState> {
  readonly id = "leitner";
  constructor(readonly intervalsDays: number[] = [1, 3, 7, 21]) {
    if (!intervalsDays.length) throw new Error("need at least one box");
  }
  initial(): LeitnerState {
    return { box: 0 }; // not yet answered
  }
  next(state: LeitnerState, outcome: Outcome, now: Date) {
    const max = this.intervalsDays.length;
    let box: number;
    if (outcome === "again") box = 1;
    else if (outcome === "hard") box = Math.max(1, state.box);
    else box = Math.min(max, state.box + 1);
    return { state: { box }, dueAt: new Date(now.getTime() + this.intervalsDays[box - 1] * DAY_MS) };
  }
}

const registry: Record<string, Scheduler<any>> = { leitner: new LeitnerScheduler() };

export function getScheduler(id = "leitner"): Scheduler<any> {
  const s = registry[id];
  if (!s) throw new Error(`unknown scheduler "${id}"`);
  return s;
}

export function registerScheduler(s: Scheduler<any>) {
  registry[s.id] = s;
}

export function outcomeOf(correct: boolean, hintUsed: boolean): Outcome {
  if (!correct) return "again";
  return hintUsed ? "hard" : "good";
}
