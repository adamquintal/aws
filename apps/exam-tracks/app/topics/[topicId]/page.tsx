import Link from "next/link";
import { notFound } from "next/navigation";
import { MDXRemote } from "next-mdx-remote/rsc";
import { requireEnrollment } from "@/lib/session";
import { loadGates, markLessonViewed, statusesFor } from "@/lib/services/learning";
import { StatusBadge } from "@/components/StatusBadge";
import { Stepper } from "@/components/Stepper";
import { FocusHeader } from "@/components/FocusHeader";
import { InlineCode } from "@/components/InlineCode";
import { LessonPre } from "@/components/LessonPre";
import { CHALLENGES } from "@/lib/promql/challenges";

export const dynamic = "force-dynamic";

export default async function TopicPage({ params, searchParams }: { params: Promise<{ topicId: string }>; searchParams: Promise<{ mastered?: string }> }) {
  const { topicId } = await params;
  const { mastered } = await searchParams;
  const { user, track } = await requireEnrollment();
  const topic = track.topics.find((t) => t.id === topicId);
  if (!topic?.lesson) notFound();
  const statuses = statusesFor(track, await loadGates(user.id, track));
  const status = statuses.get(topic.id)!;
  const label = `Topic ${topic.index + 1} of ${track.topics.length}`;

  if (status === "locked") {
    return (
      <main id="main" className="page flex min-h-dvh flex-col pt-12">
        <FocusHeader href="/topics" label={label} />
        <h1 className="display mt-10 text-[38px]">{topic.title}</h1>
        <p className="mt-4 text-[17px] leading-relaxed text-soft">This opens after the topics before it, because it builds on them. You’ll get here.</p>
        <Link href="/topics" className="btn-ghost mt-8 self-start">Back to your path</Link>
      </main>
    );
  }
  if (status === "current") await markLessonViewed(user.id, track.id, topic.id);
  const l = topic.lesson;
  const next = track.topics[topic.index + 1];
  const isMastered = status === "mastered";

  if (mastered && isMastered) {
    return (
      <main id="main" className="page flex min-h-dvh flex-col justify-center pb-16">
        <Stepper done={["Learn", "Practice", "Explain"]} />
        <p className="eyebrow mt-14">Topic mastered</p>
        <h1 className="display mt-3 text-[44px]">{topic.title}</h1>
        <p className="mt-5 text-[17px] leading-relaxed text-soft">That’s real, durable progress. It’ll come back now and then in reviews to keep it fresh.</p>
        {next ? (
          <Link href={`/topics/${next.id}`} className="btn-primary mt-10">Next: {next.title}</Link>
        ) : (
          <Link href="/today" className="btn-primary mt-10">Back to study</Link>
        )}
        <Link href="/topics" className="mt-3 self-center py-3 text-[15px] text-muted underline-offset-4 hover:underline">See your path</Link>
      </main>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="page flex flex-col gap-5 pt-12">
        <FocusHeader href={isMastered ? "/topics" : "/today"} label={label} />
        <Stepper current={isMastered ? undefined : status === "explain-back" ? "Explain" : "Learn"} done={isMastered ? ["Learn", "Practice", "Explain"] : status === "explain-back" ? ["Learn", "Practice"] : []} />
      </header>

      <main id="main" className="page flex flex-col gap-8 pb-36 pt-9">
        <div className="flex flex-col gap-4">
          <h1 className="display text-[38px]">{l.title}</h1>
          <p className="text-[18px] leading-relaxed text-soft">{l.summary}</p>
        </div>

        <figure className="m-0">
          <blockquote className="m-0 font-serif text-[22px] italic leading-[1.4] text-fg">“{l.analogy}”</blockquote>
        </figure>

        <div className="prose-lesson"><MDXRemote source={l.body} components={{ pre: LessonPre }} /></div>

        {CHALLENGES.some((c) => c.topic === topic.id) && (
          <Link href={`/playground?task=${CHALLENGES.find((c) => c.topic === topic.id)!.id}`} className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-surface p-4 hover:border-muted">
            <span>
              <span className="block text-[15px] font-semibold">Practise this on real data</span>
              <span className="mt-0.5 block text-[14px] text-muted">{CHALLENGES.filter((c) => c.topic === topic.id).length} short tasks in the PromQL playground.</span>
            </span>
            <span aria-hidden className="text-muted">→</span>
          </Link>
        )}

        <section aria-labelledby="remember">
          <h2 id="remember" className="eyebrow mb-2">Remember</h2>
          <ol className="m-0 list-none p-0">
            {l.keyPoints.map((k, i) => (
              <li key={k} className="flex gap-4 border-t border-border py-3 text-[16px] leading-relaxed last:border-b">
                <span className="w-4 shrink-0 font-serif text-[20px] leading-7 text-accent">{i + 1}</span>
                <span><InlineCode text={k} /></span>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="trap" className="rounded-2xl bg-trap p-5">
          <h2 id="trap" className="mb-2 text-[13px] font-semibold uppercase tracking-[0.08em] text-gentle">Common trap</h2>
          <p className="m-0 text-[16px] leading-relaxed text-fg"><InlineCode text={l.commonTrap} /></p>
        </section>

        {l.versionNotes.length > 0 && (
          <section aria-labelledby="vn">
            <h2 id="vn" className="eyebrow mb-2">Version notes</h2>
            {l.versionNotes.map((v) => <p key={v} className="my-2 text-[15px] leading-relaxed text-soft"><InlineCode text={v} /></p>)}
          </section>
        )}

        <footer className="flex flex-col gap-2 text-[13px] leading-relaxed text-muted">
          <p className="m-0">
            Written in our own words from{" "}
            {l.sources.map((s, i) => (
              <span key={s.url}>{i > 0 && (i === l.sources.length - 1 ? " and " : ", ")}<a className="link" href={s.url} target="_blank" rel="noreferrer">{s.title}</a></span>
            ))}.
          </p>
          <div className="flex items-center gap-2"><StatusBadge status={l.status} /><span>v{l.version}</span>{l.reviewer && <span>· reviewed by {l.reviewer}</span>}</div>
        </footer>
      </main>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        <div className="page py-4">
          {status === "current" && <Link href="/learn" className="btn-primary w-full">Start practice</Link>}
          {status === "explain-back" && <Link href={`/topics/${topic.id}/explain`} className="btn-primary w-full">Explain it back</Link>}
          {(isMastered || status === "coming-soon") && <Link href="/topics" className="btn-ghost w-full">Back to your path</Link>}
        </div>
      </div>
    </div>
  );
}
