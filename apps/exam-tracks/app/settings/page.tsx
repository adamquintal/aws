import Link from "next/link";
import { requireEnrollment } from "@/lib/session";
import { deleteAccount, updateProfile } from "@/app/actions";

export const metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function Settings() {
  const { user, enrollment, track } = await requireEnrollment();
  const zones = Intl.supportedValuesOf("timeZone");
  return (
    <div className="mx-auto max-w-lg space-y-8">
      <h1 className="text-2xl font-semibold">Settings</h1>

      <form action={updateProfile} className="card space-y-4">
        <h2 className="font-semibold">Profile</h2>
        <div className="space-y-1">
          <label htmlFor="name" className="label">Name</label>
          <input id="name" name="name" defaultValue={user.name ?? ""} className="input" maxLength={80} />
        </div>
        <div className="space-y-1">
          <label htmlFor="tz" className="label">Timezone (decides when your study day starts)</label>
          <select id="tz" name="timezone" defaultValue={user.timezone} className="input">
            {zones.map((z) => <option key={z}>{z}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor="examDate" className="label">{track.shortTitle} exam date (optional)</label>
          <input id="examDate" name="examDate" type="date" className="input" defaultValue={enrollment.examDate?.toISOString().slice(0, 10) ?? ""} />
        </div>
        <button className="btn-primary">Save</button>
      </form>

      <section className="card space-y-2">
        <h2 className="font-semibold">Track</h2>
        <p className="text-sm">Studying <strong>{track.title}</strong>.</p>
        <Link href="/onboarding" className="btn-ghost">Change track</Link>
        <p className="text-xs text-muted">Your progress on each track is kept if you switch.</p>
      </section>

      <section className="card space-y-2">
        <h2 className="font-semibold">Your data</h2>
        <p className="text-sm text-muted">Download everything we store about you as JSON.</p>
        <a href="/api/export" className="btn-ghost" download>Export my data</a>
      </section>

      <form action={deleteAccount} className="card space-y-3 border-gentle">
        <h2 className="font-semibold">Delete account</h2>
        <p className="text-sm">This permanently deletes your account and all study history. It can't be undone.</p>
        <label htmlFor="confirm" className="label">Type “delete” to confirm</label>
        <input id="confirm" name="confirm" className="input" autoComplete="off" required pattern="[Dd][Ee][Ll][Ee][Tt][Ee]" />
        <button className="btn-ghost text-gentle">Delete my account</button>
      </form>
    </div>
  );
}
