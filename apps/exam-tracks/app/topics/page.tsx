import Link from "next/link";
import { requireEnrollment } from "@/lib/session";
import { loadGates, statusesFor } from "@/lib/services/learning";
import { latestDiagnostic } from "@/lib/services/exams";
import { TabBar } from "@/components/TabBar";
import { IconCheck } from "@/components/Icons";

export const metadata = { title: "Path" };
export const dynamic = "force-dynamic";

const META = { mastered: "mastered", "explain-back": "one step left", current: "learning now", "coming-soon": "being written", locked: "" } as const;

export default async function Path() {
  const { user, track } = await requireEnrollment();
  const [gates, diag] = await Promise.all([loadGates(user.id, track), latestDiagnostic(user.id, track.id)]);
  // Topics missed in the pre-course check get a gentle "take it slowly" marker.
  const watch = new Set(Object.entries(diag?.result.byTopic ?? {}).filter(([, t]) => t.correct < t.total).map(([id]) => id));
  const statuses = statusesFor(track, gates);
  const domainTitle = Object.fromEntries(track.domains.map((d) => [d.id, d.title]));
  const mastered = track.topics.filter((t) => statuses.get(t.id) === "mastered").length;
  const target = track.mastery.runTarget;

  return (
    <main id="main" className="page pt-14">
      <h1 className="display text-[40px]">Your path</h1>
      <p className="mt-1.5 text-[15px] text-muted">{mastered} of {track.topics.length} mastered · each topic opens the next</p>
      {watch.size > 0 && <p className="mt-2 text-[13px] text-muted">Topics marked <span className="font-medium text-gentle">take it slowly</span> came up as gaps in your <Link className="link" href={`/exams/${diag!.id}/results`}>pre-course check</Link>.</p>}

      <ol className="mt-6 list-none p-0">
        {track.topics.map((t, idx) => {
          const s = statuses.get(t.id)!;
          const done = s === "mastered";
          const active = s === "current" || s === "explain-back" || s === "coming-soon";
          const first = idx === 0, last = idx === track.topics.length - 1;
          const prevDone = idx > 0 && statuses.get(track.topics[idx - 1].id) === "mastered";
          const run = gates.get(t.id)?.run ?? 0;
          const node = done
            ? "bg-accent text-surface"
            : active ? "border-2 border-fg bg-surface text-fg" : "border-[1.5px] border-track bg-bg text-muted";
          const body = (
            <>
              <span className={`text-[16px] leading-snug ${s === "locked" ? "text-muted" : "font-semibold text-fg"}`}>{t.title}</span>
              <span className="text-[13px] text-muted">
                {domainTitle[t.domain]}{META[s] ? ` · ${META[s]}` : ""}
                {watch.has(t.id) && !done && <span className="font-medium text-gentle"> · take it slowly</span>}
              </span>
            </>
          );
          return (
            <li key={t.id} className="flex gap-4">
              <div className="flex w-7 flex-col items-center" aria-hidden>
                <div className={`h-3 w-0.5 ${first ? "bg-transparent" : prevDone ? "bg-accent" : "bg-track"}`} />
                <div className={`flex h-7 w-7 items-center justify-center rounded-full text-[13px] font-semibold ${node}`}>
                  {done ? <IconCheck size={15} /> : idx + 1}
                </div>
                <div className={`min-h-3 w-0.5 flex-1 ${last ? "bg-transparent" : done ? "bg-accent" : "bg-track"}`} />
              </div>
              <div className="flex flex-1 flex-col gap-0.5 pb-4 pt-2.5">
                {s !== "locked" && t.lesson ? (
                  <Link href={`/topics/${t.id}`} className="flex flex-col gap-0.5 hover:opacity-80">{body}</Link>
                ) : (
                  <div className="flex flex-col gap-0.5">{body}</div>
                )}
                {s === "current" && (
                  <Link href={gates.get(t.id)?.lessonViewedAt ? "/learn" : `/topics/${t.id}`} className="mt-2 inline-flex h-10 items-center self-start rounded-xl bg-ink px-4 text-[14px] font-semibold text-on-ink">
                    Continue · {run}/{target} in a row
                  </Link>
                )}
                {s === "explain-back" && (
                  <Link href={`/topics/${t.id}/explain`} className="mt-2 inline-flex h-10 items-center self-start rounded-xl bg-ink px-4 text-[14px] font-semibold text-on-ink">Explain it back</Link>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      <TabBar active="path" />
    </main>
  );
}
