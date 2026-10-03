/**
 * Mastery gate. A topic is mastered after `runTarget` correct answers in a row
 * without hints, followed by an explain-it-back step. A miss (or a hint)
 * resets the run, quietly: it is a "not yet", never a failure.
 */

export type GateState = {
  run: number;
  bestRun: number;
  gateReachedAt: Date | null;
  masteredAt: Date | null;
};

export type GateEvent = "progress" | "reset" | "gate-reached" | "unchanged";

export const emptyGate = (): GateState => ({ run: 0, bestRun: 0, gateReachedAt: null, masteredAt: null });

export function applyAnswer(
  state: GateState,
  answer: { correct: boolean; hintUsed: boolean },
  runTarget: number,
  now: Date,
): { state: GateState; event: GateEvent } {
  // Once the run target is reached the gate stays open; reviews never take mastery away.
  if (state.masteredAt || state.gateReachedAt) return { state, event: "unchanged" };

  if (!answer.correct || answer.hintUsed) {
    return { state: { ...state, run: 0 }, event: state.run === 0 ? "unchanged" : "reset" };
  }
  const run = state.run + 1;
  const next: GateState = { ...state, run, bestRun: Math.max(state.bestRun, run) };
  if (run >= runTarget) return { state: { ...next, gateReachedAt: now }, event: "gate-reached" };
  return { state: next, event: "progress" };
}

/** Explain-it-back completes mastery. Any honest self-rating counts: the point is the act of explaining. */
export function completeExplainBack(state: GateState, now: Date): GateState {
  if (state.masteredAt) return state;
  if (!state.gateReachedAt) throw new Error("explain-it-back is only available after the run target is reached");
  return { ...state, masteredAt: now };
}

export type TopicStatus = "mastered" | "explain-back" | "current" | "coming-soon" | "locked";

/**
 * Strict linear unlocking: everything before the first unmastered topic is
 * mastered, that topic is current (or awaiting explain-back, or has no content
 * yet), and everything after it is locked.
 */
export function topicStatuses(
  topics: { id: string; hasContent: boolean }[],
  progress: Map<string, GateState>,
): Map<string, TopicStatus> {
  const out = new Map<string, TopicStatus>();
  let frontierFound = false;
  for (const t of topics) {
    const p = progress.get(t.id);
    if (frontierFound) out.set(t.id, "locked");
    else if (p?.masteredAt) out.set(t.id, "mastered");
    else {
      frontierFound = true;
      if (!t.hasContent) out.set(t.id, "coming-soon");
      else if (p?.gateReachedAt) out.set(t.id, "explain-back");
      else out.set(t.id, "current");
    }
  }
  return out;
}
