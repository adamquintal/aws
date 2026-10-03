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
    <main id="main" className="page flex min-h-dvh flex-col pb-10 pt-16">
      <span className="font-semibold">Exam Tracks</span>
      {deleted && <p role="status" className="mt-6 text-[15px] text-soft">Your account and all of your data have been deleted.</p>}
      <h1 className="display mt-auto text-[52px]">Get ready, one calm step at a time.</h1>
      <p className="mt-5 text-[18px] leading-relaxed text-soft">Short daily sessions, plain-English lessons and an honest readiness score, so you know when you’re actually ready. No timers. No failure screens.</p>
      <Link href="/signin" className="btn-primary mt-10">Start studying</Link>
      <ul className="mt-10 list-none border-t border-border p-0">
        {tracks.map((t) => (
          <li key={t.id} className="row"><span>{t.title}</span><span className="text-muted">{t.topics.length} topics</span></li>
        ))}
      </ul>
      <p className="mt-6 text-xs leading-relaxed text-muted">Independent study material. Not affiliated with or endorsed by the CNCF or the Linux Foundation.</p>
    </main>
  );
}
