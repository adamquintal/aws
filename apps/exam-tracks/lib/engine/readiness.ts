/**
 * Honest readiness: weighted by exam domain and counting the full curriculum,
 * so untouched topics pull the score down instead of being ignored.
 *
 *   domainScore = recentAccuracy × (mastered topics / all topics in domain)
 *   readiness   = Σ weight × domainScore   (0–100)
 *
 * "Ready to book" needs every domain ≥ threshold on recent attempts, every
 * topic mastered, and a passed mock exam.
 */

export type AttemptLite = { domainId: string; topicId: string; correct: boolean; firstAttempt: boolean; createdAt: Date; context?: string };
export type DomainDef = { id: string; title: string; weight: number; topicIds: string[] };

export type DomainReadiness = {
  domainId: string;
  title: string;
  weight: number;
  recentAccuracy: number | null; // null = no attempts yet
  recentCount: number;
  coverage: number; // 0–1
  score: number; // 0–1
};

export type Readiness = {
  score: number; // 0–100
  domains: DomainReadiness[];
  readyToBook: boolean;
  /** Calm, actionable next steps explaining what is left. Empty when ready. */
  nextSteps: string[];
};

export const MIN_RECENT_SAMPLE = 20;

export function computeReadiness(opts: {
  domains: DomainDef[];
  attempts: AttemptLite[]; // any order
  mastered: Set<string>;
  mockPassed: boolean;
  threshold?: number;
  recentWindow?: number;
  examHasMock?: boolean;
}): Readiness {
  const threshold = opts.threshold ?? 0.8;
  const window = opts.recentWindow ?? 30;
  const sorted = [...opts.attempts].filter((a) => a.context !== "mock" && a.context !== "diagnostic").sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const totalWeight = opts.domains.reduce((s, d) => s + d.weight, 0) || 1;

  const domains: DomainReadiness[] = opts.domains.map((d) => {
    const recent = sorted.filter((a) => a.domainId === d.id).slice(0, window);
    const recentAccuracy = recent.length ? recent.filter((a) => a.correct).length / recent.length : null;
    const coverage = d.topicIds.length ? d.topicIds.filter((t) => opts.mastered.has(t)).length / d.topicIds.length : 0;
    return {
      domainId: d.id,
      title: d.title,
      weight: d.weight,
      recentAccuracy,
      recentCount: recent.length,
      coverage,
      score: (recentAccuracy ?? 0) * coverage,
    };
  });

  const score = (100 * domains.reduce((s, d) => s + d.weight * d.score, 0)) / totalWeight;

  const nextSteps: string[] = [];
  for (const d of [...domains].sort((a, b) => b.weight - a.weight)) {
    if (d.coverage < 1) {
      const left = Math.round((1 - d.coverage) * opts.domains.find((x) => x.id === d.domainId)!.topicIds.length);
      nextSteps.push(`Master the ${left} remaining ${left === 1 ? "topic" : "topics"} in ${d.title}.`);
    } else if (d.recentCount < MIN_RECENT_SAMPLE) {
      nextSteps.push(`Answer a few more ${d.title} reviews so your recent accuracy is reliable (${d.recentCount}/${MIN_RECENT_SAMPLE}).`);
    } else if ((d.recentAccuracy ?? 0) < threshold) {
      nextSteps.push(`Bring ${d.title} from ${pct(d.recentAccuracy)} to ${pct(threshold)} with focused reviews.`);
    }
  }
  if (opts.examHasMock !== false && !opts.mockPassed) nextSteps.push("Pass one full mock exam.");

  return { score: round1(score), domains, readyToBook: nextSteps.length === 0, nextSteps };
}

export type SinceDayOne = { domainId: string; firstAccuracy: number | null; firstCount: number; recentAccuracy: number | null; recentCount: number };

/** First-attempt accuracy (how you did seeing each question for the first time) vs recent accuracy, per domain. */
export function sinceDayOne(domains: DomainDef[], attempts: AttemptLite[], recentWindow = 30): SinceDayOne[] {
  const sorted = [...attempts].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  return domains.map((d) => {
    const inDomain = sorted.filter((a) => a.domainId === d.id);
    const first = inDomain.filter((a) => a.firstAttempt);
    const recent = inDomain.slice(0, recentWindow);
    const acc = (xs: AttemptLite[]) => (xs.length ? xs.filter((a) => a.correct).length / xs.length : null);
    return { domainId: d.id, firstAccuracy: acc(first), firstCount: first.length, recentAccuracy: acc(recent), recentCount: recent.length };
  });
}

/** Topics with the lowest recent accuracy (min 3 attempts), as gentle next steps. */
export function weakestTopics(attempts: AttemptLite[], limit = 3, window = 20) {
  const by = new Map<string, AttemptLite[]>();
  for (const a of [...attempts].sort((x, y) => y.createdAt.getTime() - x.createdAt.getTime())) {
    const list = by.get(a.topicId) ?? [];
    if (list.length < window) list.push(a);
    by.set(a.topicId, list);
  }
  return [...by.entries()]
    .filter(([, xs]) => xs.length >= 3)
    .map(([topicId, xs]) => ({ topicId, accuracy: xs.filter((a) => a.correct).length / xs.length, count: xs.length }))
    .filter((t) => t.accuracy < 0.9)
    .sort((a, b) => a.accuracy - b.accuracy)
    .slice(0, limit);
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const pct = (n: number | null) => `${Math.round((n ?? 0) * 100)}%`;
