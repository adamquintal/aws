import Link from "next/link";
import { notFound } from "next/navigation";
import { MDXRemote } from "next-mdx-remote/rsc";
import { requireEnrollment } from "@/lib/session";
import { loadGates, markLessonViewed, statusesFor } from "@/lib/services/learning";
import { StatusBadge } from "@/components/StatusBadge";

export const dynamic = "force-dynamic";

export default async function TopicPage({ params, searchParams }: { params: Promise<{ topicId: string }>; searchParams: Promise<{ mastered?: string }> }) {
  const { topicId } = await params;
  const { mastered } = await searchParams;
  const { user, track } = await requireEnrollment();
  const topic = track.topics.find((t) => t.id === topicId);
  if (!topic?.lesson) notFound();
  const statuses = statusesFor(track, await loadGates(user.id, track));
  const status = statuses.get(topic.id)!;
  if (status === "locked") {
    return (
      <div className="card space-y-3">
        <h1 className="text-xl font-semibold">{topic.title}</h1>
        <p className="text-muted">This topic opens after the ones before it, because it builds on them. You'll get here.</p>
        <Link href="/topics" className="btn-ghost">Back to topics</Link>
      </div>
    );
  }
  if (status === "current") await markLessonViewed(user.id, track.id, topic.id);
  const l = topic.lesson;
  const next = track.topics[topic.index + 1];

  return (
    <article className="space-y-6">
      {mastered && (
        <div role="status" className="card border-good">
          <p className="font-semibold text-good">🌿 Topic mastered: {topic.title}</p>
          <p className="mt-1 text-sm">That's real, durable progress. It'll come back now and then in reviews to keep it fresh.</p>
          {next && <Link href={`/topics/${next.id}`} className="btn-primary mt-3">Next: {next.title}</Link>}
        </div>
      )}
      <header className="space-y-2">
        <p className="text-sm text-muted">Topic {topic.index + 1} · {track.domains.find((d) => d.id === topic.domain)?.title} · {topic.curriculumItem}</p>
        <h1 className="text-2xl font-semibold">{l.title}</h1>
        <p className="text-lg text-muted">{l.summary}</p>
      </header>

      <section className="card" aria-labelledby="analogy">
        <h2 id="analogy" className="label">Think of it like this</h2>
        <p className="mt-1">{l.analogy}</p>
      </section>

      <div className="prose-lesson">
        <MDXRemote source={l.body} />
      </div>

      <section className="card" aria-labelledby="kp">
        <h2 id="kp" className="font-semibold">Key points</h2>
        <ul className="mt-2 list-disc space-y-1 pl-6">{l.keyPoints.map((k) => <li key={k}>{k}</li>)}</ul>
      </section>

      <section className="card border-gentle" aria-labelledby="trap">
        <h2 id="trap" className="font-semibold text-gentle">Common trap</h2>
        <p className="mt-1">{l.commonTrap}</p>
      </section>

      {l.versionNotes.length > 0 && (
        <section className="card" aria-labelledby="vn">
          <h2 id="vn" className="font-semibold">Version notes</h2>
          <ul className="mt-2 list-disc space-y-1 pl-6 text-sm">{l.versionNotes.map((k) => <li key={k}>{k}</li>)}</ul>
        </section>
      )}

      <footer className="space-y-3 border-t border-border pt-4 text-sm text-muted">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={l.status} /> <span>v{l.version}</span>
          {l.reviewer && <span>· reviewed by {l.reviewer}</span>}
        </div>
        <div>
          Written in our own words from:
          <ul className="mt-1 list-disc pl-6">
            {l.sources.map((s) => <li key={s.url}><a className="underline" href={s.url} target="_blank" rel="noreferrer">{s.title}</a></li>)}
          </ul>
        </div>
      </footer>

      <div className="flex flex-wrap gap-3">
        {status === "current" && <Link href="/learn" className="btn-primary">Practice this topic</Link>}
        {status === "explain-back" && <Link href={`/topics/${topic.id}/explain`} className="btn-primary">Explain it back</Link>}
        <Link href="/topics" className="btn-ghost">All topics</Link>
      </div>
    </article>
  );
}
