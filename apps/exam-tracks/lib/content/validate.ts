import { type LoadedTrack, loadTrackFromDisk, listTrackIds, CONTENT_ROOT } from "./load";

export type Issue = { level: "error" | "warning"; where: string; message: string };

function hostAllowed(url: string, allowed: string[]): boolean {
  const u = new URL(url);
  return allowed.some((a) => {
    const [host, ...pathParts] = a.split("/");
    const prefix = pathParts.length ? "/" + pathParts.join("/") : "";
    return (u.hostname === host || u.hostname.endsWith("." + host)) && u.pathname.startsWith(prefix);
  });
}

export function validateTrack(track: LoadedTrack): Issue[] {
  const issues: Issue[] = [];
  const err = (where: string, message: string) => issues.push({ level: "error", where, message });
  const warn = (where: string, message: string) => issues.push({ level: "warning", where, message });

  const weight = track.domains.reduce((s, d) => s + d.weight, 0);
  if (Math.abs(weight - 100) > 0.001) err(track.id, `domain weights sum to ${weight}, expected 100`);

  const domainIds = new Set(track.domains.map((d) => d.id));
  const topicIds = new Set<string>();
  const questionIds = new Set<string>();
  const known = new Set<string>(); // terms introduced so far, in learning order

  for (const d of track.domains)
    if (!track.topics.some((t) => t.domain === d.id)) err(track.id, `domain "${d.id}" has no topics`);

  for (const topic of track.topics) {
    const where = `${track.id}/${topic.id}`;
    if (topicIds.has(topic.id)) err(where, "duplicate topic id");
    topicIds.add(topic.id);
    if (!domainIds.has(topic.domain)) err(where, `unknown domain "${topic.domain}"`);

    const items = [...(topic.lesson ? [{ ...topic.lesson, kind: "lesson", id: topic.id }] : [])];
    if (!topic.lesson) warn(where, "no lesson yet");
    if (topic.questions.length === 0) warn(where, "no questions yet");
    if (topic.questions.length > 0 && !topic.lesson) err(where, "questions exist without a lesson to teach them");

    topic.lesson?.introduces.forEach((t) => known.add(t.toLowerCase()));

    for (const it of [...items, ...topic.questions.map((q) => ({ kind: "question", ...q }))]) {
      const w = `${where}/${it.kind}:${it.id}`;
      for (const s of it.sources)
        if (!hostAllowed(s.url, track.allowedSourceHosts)) err(w, `source not on an allowed host: ${s.url}`);
      if (it.status === "human-verified" && !it.reviewer) err(w, "human-verified items must name a reviewer");
      if (it.status !== "human-verified" && it.reviewer) warn(w, "reviewer set but status is not human-verified");
    }

    for (const q of topic.questions) {
      const w = `${where}/question:${q.id}`;
      if (questionIds.has(q.id)) err(w, "duplicate question id in track");
      questionIds.add(q.id);
      // Options are shuffled at display time, so positional options make no sense.
      for (const o of q.options)
        if (/\b(all|none|both) of the above\b|^(a|b) and (b|c)\b/i.test(o.text)) err(w, `option ${o.id} depends on position ("${o.text}")`);
      for (const term of q.uses)
        if (!known.has(term.toLowerCase())) err(w, `uses term "${term}" before any lesson introduces it`);
    }
  }
  return issues;
}

export function validateAll(root = CONTENT_ROOT): Issue[] {
  const issues: Issue[] = [];
  for (const id of listTrackIds(root)) {
    try {
      issues.push(...validateTrack(loadTrackFromDisk(id, root)));
    } catch (e) {
      issues.push({ level: "error", where: id, message: (e as Error).message });
    }
  }
  return issues;
}
