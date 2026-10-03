import crypto from "node:crypto";
import { getAllTracks, type LoadedTrack } from "@/lib/content/load";
import type { Status } from "@/lib/content/schema";

export type ContentItem = {
  itemId: string; // "<track>/<topic>/lesson" or "<track>/<topic>/<questionId>"
  kind: "lesson" | "question";
  trackId: string;
  topicId: string;
  title: string;
  version: number;
  status: Status;
  reviewer: string | null;
  sources: { url: string; title: string }[];
  body: unknown;
};

export function itemsForTrack(track: LoadedTrack): ContentItem[] {
  const out: ContentItem[] = [];
  for (const t of track.topics) {
    if (t.lesson) {
      const { status, reviewer, version, sources, ...rest } = t.lesson;
      out.push({ itemId: `${track.id}/${t.id}/lesson`, kind: "lesson", trackId: track.id, topicId: t.id, title: `Lesson: ${t.title}`, version, status, reviewer, sources, body: rest });
    }
    for (const q of t.questions) {
      const { status, reviewer, version, sources, ...rest } = q;
      out.push({ itemId: `${track.id}/${t.id}/${q.id}`, kind: "question", trackId: track.id, topicId: t.id, title: q.stem, version, status, reviewer, sources, body: rest });
    }
  }
  for (const q of track.examPool) {
    const { status, reviewer, version, sources, domain: _d, file: _f, ...rest } = q;
    out.push({ itemId: `${track.id}/exam/${q.id}`, kind: "question", trackId: track.id, topicId: q.topic, title: `Exam: ${q.stem}`, version, status, reviewer, sources, body: rest });
  }
  return out;
}

export function allItems(): ContentItem[] {
  return getAllTracks().flatMap(itemsForTrack);
}

/** Stable hash of an item's reviewable content (excluding review metadata). */
export function hashBody(body: unknown, sources: unknown): string {
  return crypto.createHash("sha256").update(JSON.stringify({ body, sources })).digest("hex").slice(0, 16);
}

/** Human-readable text form used for diffs between versions. */
export function renderForDiff(body: unknown, sources: { url: string; title: string }[]): string {
  return JSON.stringify({ ...(body as object), sources }, null, 2);
}

export const DB_STATUS = { draft: "draft", "source-checked": "source_checked", "human-verified": "human_verified" } as const;
export const FILE_STATUS = { draft: "draft", source_checked: "source-checked", human_verified: "human-verified" } as const;
