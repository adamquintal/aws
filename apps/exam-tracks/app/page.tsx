import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getAllTracks } from "@/lib/content/load";

export default async function Home({ searchParams }: { searchParams: Promise<{ deleted?: string }> }) {
  const session = await auth();
  const { deleted } = await searchParams;
  if (session?.user && !deleted) redirect("/today");
  const tracks = getAllTracks();
  return (
    <div className="space-y-10">
      {deleted && <p role="status" className="card">Your account and all of your data have been deleted.</p>}
      <section className="space-y-4">
        <h1 className="text-3xl font-semibold sm:text-4xl">Get ready, one calm step at a time.</h1>
        <p className="max-w-2xl text-lg text-muted">
          Short daily sessions, plain-English lessons, and an honest readiness score, so you know when you're actually ready.
          No timers, no failure screens.
        </p>
        <Link href="/signin" className="btn-primary">Start studying</Link>
      </section>
      <section aria-labelledby="tracks" className="space-y-3">
        <h2 id="tracks" className="text-xl font-semibold">Tracks</h2>
        <ul className="grid gap-3 sm:grid-cols-2">
          {tracks.map((t) => (
            <li key={t.id} className="card">
              <h3 className="font-semibold">{t.title}</h3>
              <p className="mt-1 text-sm text-muted">{t.description}</p>
              <p className="mt-2 text-xs text-muted">{t.topics.length} topics · {t.domains.length} domains</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
