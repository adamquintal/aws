import { requireEnrollment } from "@/lib/session";
import { prisma } from "@/lib/db";
import { FAMILIES } from "@/lib/promql/dataset";
import { CHALLENGES } from "@/lib/promql/challenges";
import { FocusHeader } from "@/components/FocusHeader";
import { Playground } from "@/components/playground/Playground";

export const metadata = { title: "PromQL playground" };
export const dynamic = "force-dynamic";

export default async function PlaygroundPage({ searchParams }: { searchParams: Promise<{ q?: string; task?: string }> }) {
  const { q, task } = await searchParams;
  const { user, track } = await requireEnrollment();
  const solves = await prisma.playgroundSolve.findMany({ where: { userId: user.id }, select: { challengeId: true } });
  const families = Object.entries(FAMILIES).map(([name, f]) => ({ name, type: f.type, help: f.help })).sort((a, b) => a.name.localeCompare(b.name));
  const topicIds = new Set(CHALLENGES.map((c) => c.topic));
  return (
    <main id="main" className="page pt-12">
      <FocusHeader href="/topics" label="PromQL playground" />
      <h1 className="display mt-6 text-[36px]">Try PromQL</h1>
      <p className="mt-2 text-[15px] leading-relaxed text-muted">Real queries on three hours of sample data from a small fleet. Explore freely, or work through short tasks.</p>
      <div className="mt-6">
        <Playground
          initialQuery={(q ?? "").slice(0, 2000)}
          initialChallenge={task ?? null}
          solved={solves.map((s) => s.challengeId)}
          families={families}
          topics={track.topics.filter((t) => topicIds.has(t.id)).map((t) => ({ id: t.id, title: t.title }))}
        />
      </div>
    </main>
  );
}
