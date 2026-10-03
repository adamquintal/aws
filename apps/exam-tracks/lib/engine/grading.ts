/** Exact-set grading: a multi-select answer is right only if it selects every correct option and nothing else. */
export function gradeAnswer(options: { id: string; correct: boolean }[], selected: string[]): boolean {
  const correct = options.filter((o) => o.correct).map((o) => o.id).sort();
  const sel = [...new Set(selected)].sort();
  return correct.length === sel.length && correct.every((id, i) => id === sel[i]);
}
