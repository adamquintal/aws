import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import {
  examQuestionSchema,
  lessonFrontmatterSchema,
  questionSchema,
  trackSchema,
  type ExamQuestion,
  type Lesson,
  type Question,
  type Track,
} from "./schema";

export const CONTENT_ROOT = path.join(process.cwd(), "content", "tracks");

export type LoadedTopic = Track["topics"][number] & {
  index: number;
  lesson: Lesson | null;
  questions: Question[];
};

export type LoadedExamQuestion = ExamQuestion & { domain: string; file: string };
export type LoadedTrack = Omit<Track, "topics"> & { topics: LoadedTopic[]; examPool: LoadedExamQuestion[] };

export class ContentError extends Error {
  constructor(public file: string, message: string) {
    super(`${path.relative(process.cwd(), file)}: ${message}`);
  }
}

function readJson(file: string): unknown {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (e) {
    throw new ContentError(file, `invalid JSON: ${(e as Error).message}`);
  }
}

function formatZod(err: import("zod").ZodError): string {
  return err.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
}

/** Load one track. Missing lesson/question files are allowed here (coverage reports them); invalid files throw. */
export function loadTrackFromDisk(trackId: string, root = CONTENT_ROOT): LoadedTrack {
  const dir = path.join(root, trackId);
  const trackFile = path.join(dir, "track.json");
  const parsed = trackSchema.safeParse(readJson(trackFile));
  if (!parsed.success) throw new ContentError(trackFile, formatZod(parsed.error));
  const track = parsed.data;

  const topics: LoadedTopic[] = track.topics.map((t, index) => {
    const topicDir = path.join(dir, "topics", t.id);
    const lessonFile = path.join(topicDir, "lesson.mdx");
    const questionsFile = path.join(topicDir, "questions.json");

    let lesson: Lesson | null = null;
    if (fs.existsSync(lessonFile)) {
      const { data, content } = matter(fs.readFileSync(lessonFile, "utf8"));
      const fm = lessonFrontmatterSchema.safeParse(data);
      if (!fm.success) throw new ContentError(lessonFile, formatZod(fm.error));
      if (fm.data.id !== t.id) throw new ContentError(lessonFile, `lesson id "${fm.data.id}" != topic id "${t.id}"`);
      lesson = { ...fm.data, body: content.trim() };
    }

    let questions: Question[] = [];
    if (fs.existsSync(questionsFile)) {
      const raw = readJson(questionsFile);
      if (!Array.isArray(raw)) throw new ContentError(questionsFile, "expected an array of questions");
      questions = raw.map((q, i) => {
        const r = questionSchema.safeParse(q);
        if (!r.success) throw new ContentError(questionsFile, `question[${i}] ${(q as { id?: string })?.id ?? ""}: ${formatZod(r.error)}`);
        return r.data;
      });
    }
    return { ...t, index, lesson, questions };
  });

  // Exam-only pool: content/tracks/<id>/exam/*.json, one file per domain by convention.
  const examDir = path.join(dir, "exam");
  const examPool: LoadedExamQuestion[] = [];
  if (fs.existsSync(examDir)) {
    for (const f of fs.readdirSync(examDir).filter((x) => x.endsWith(".json")).sort()) {
      const file = path.join(examDir, f);
      const raw = readJson(file);
      if (!Array.isArray(raw)) throw new ContentError(file, "expected an array of questions");
      raw.forEach((q, i) => {
        const r = examQuestionSchema.safeParse(q);
        if (!r.success) throw new ContentError(file, `question[${i}] ${(q as { id?: string })?.id ?? ""}: ${formatZod(r.error)}`);
        const topic = track.topics.find((t) => t.id === r.data.topic);
        examPool.push({ ...r.data, domain: topic?.domain ?? "", file: f });
      });
    }
  }

  return { ...track, topics, examPool };
}

export function listTrackIds(root = CONTENT_ROOT): string[] {
  if (!fs.existsSync(root)) return [];
  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(root, d.name, "track.json")))
    .map((d) => d.name)
    .sort();
}

// Content is immutable for the lifetime of a server process, so cache it.
const cache = new Map<string, LoadedTrack>();

export function getTrack(trackId: string): LoadedTrack | null {
  if (!listTrackIds().includes(trackId)) return null;
  if (process.env.NODE_ENV !== "development" && cache.has(trackId)) return cache.get(trackId)!;
  const t = loadTrackFromDisk(trackId);
  cache.set(trackId, t);
  return t;
}

export function getAllTracks(): LoadedTrack[] {
  return listTrackIds().map((id) => getTrack(id)!);
}

export function findQuestion(track: LoadedTrack, questionId: string) {
  for (const topic of track.topics) {
    const q = topic.questions.find((x) => x.id === questionId);
    if (q) return { topic, question: q };
  }
  return null;
}

export function findExamQuestion(track: LoadedTrack, questionId: string) {
  const question = track.examPool.find((q) => q.id === questionId);
  if (!question) return null;
  return { topic: track.topics.find((t) => t.id === question.topic)!, question };
}
