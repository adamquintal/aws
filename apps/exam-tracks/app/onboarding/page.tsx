import { requireUser } from "@/lib/session";
import { getAllTracks } from "@/lib/content/load";
import { enroll } from "@/app/actions";
import { TimezoneField } from "@/components/TimezoneField";

export const metadata = { title: "Welcome" };

export default async function Onboarding() {
  const user = await requireUser();
  const tracks = getAllTracks();
  return (
    <form action={enroll} id="main" className="page flex min-h-dvh max-w-md flex-col justify-center gap-7 pb-16 pt-12">
      <div>
        <h1 className="display text-[44px]">Welcome{user.name ? `, ${user.name}` : ""}.</h1>
        <p className="mt-3 text-[17px] text-soft">Two quick choices and you're in. You can change these any time.</p>
      </div>
      <div className="space-y-2">
        <label htmlFor="name" className="label">What should we call you? (optional)</label>
        <input id="name" name="name" defaultValue={user.name ?? ""} className="input" maxLength={80} />
      </div>
      <fieldset className="space-y-2">
        <legend className="label">Choose a track</legend>
        {tracks.map((t, i) => (
          <label key={t.id} className="flex cursor-pointer gap-3 rounded-2xl border border-border bg-surface p-4 has-[:checked]:border-2 has-[:checked]:border-accent">
            <input type="radio" name="trackId" value={t.id} defaultChecked={i === 0} className="mt-1" />
            <span>
              <span className="font-medium">{t.title}</span>
              <span className="mt-1 block text-sm text-muted">{t.description}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <div className="space-y-2">
        <label htmlFor="examDate" className="label">Exam date (optional)</label>
        <input id="examDate" name="examDate" type="date" className="input" />
        <p className="text-sm text-muted">If you set one, we'll show whether your pace gets you ready in time. No pressure if not.</p>
      </div>
      <TimezoneField defaultValue={user.timezone} />
      <button className="btn-primary w-full">Let's begin</button>
    </form>
  );
}
