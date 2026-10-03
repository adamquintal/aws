import Link from "next/link";
import { requireEnrollment } from "@/lib/session";
import { deleteAccount, updateProfile } from "@/app/actions";
import { signOut } from "@/auth";
import { FocusHeader } from "@/components/FocusHeader";
import { ThemeToggle } from "@/components/ThemeToggle";

export const metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function Settings() {
  const { user, enrollment, track } = await requireEnrollment();
  const zones = Intl.supportedValuesOf("timeZone");
  return (
    <main id="main" className="page pb-16 pt-12">
      <FocusHeader href="/today" label="Settings" />
      <h1 className="display mt-6 text-[40px]">Settings</h1>

      <form action={updateProfile} className="mt-8 flex flex-col gap-5">
        <h2 className="eyebrow">Profile</h2>
        <Field id="name" label="Name"><input id="name" name="name" defaultValue={user.name ?? ""} className="input" maxLength={80} /></Field>
        <Field id="tz" label="Timezone" hint="Decides when your study day starts.">
          <select id="tz" name="timezone" defaultValue={user.timezone} className="input">{zones.map((z) => <option key={z}>{z}</option>)}</select>
        </Field>
        <Field id="examDate" label={`${track.shortTitle} exam date`} hint="Optional. Used for your projected ready date.">
          <input id="examDate" name="examDate" type="date" className="input" defaultValue={enrollment.examDate?.toISOString().slice(0, 10) ?? ""} />
        </Field>
        <button className="btn-primary self-start px-8">Save</button>
      </form>

      <section className="mt-12">
        <h2 className="eyebrow mb-2">App</h2>
        <div className="border-t border-border">
          <div className="row"><span>Theme</span><ThemeToggle /></div>
          <div className="row"><span>Track</span><Link href="/onboarding" className="link">{track.shortTitle} · change</Link></div>
          <div className="row"><span>Your data</span><a href="/api/export" className="link" download>Export as JSON</a></div>
          {user.role !== "LEARNER" && <div className="row"><span>Content review</span><Link href="/admin" className="link">Open admin</Link></div>}
          <form action={async () => { "use server"; await signOut({ redirectTo: "/" }); }} className="row">
            <span className="text-muted">{user.email}</span>
            <button className="link">Sign out</button>
          </form>
        </div>
      </section>

      <form action={deleteAccount} className="mt-12 flex flex-col gap-3">
        <h2 className="eyebrow">Delete account</h2>
        <p className="text-[15px] leading-relaxed text-soft">Permanently deletes your account and all study history. This can’t be undone.</p>
        <Field id="confirm" label="Type “delete” to confirm">
          <input id="confirm" name="confirm" className="input" autoComplete="off" required pattern="[Dd][Ee][Ll][Ee][Tt][Ee]" />
        </Field>
        <button className="btn-ghost self-start text-gentle">Delete my account</button>
      </form>
    </main>
  );
}

function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[15px] font-medium">{label}</label>
      {children}
      {hint && <span className="text-[13px] text-muted">{hint}</span>}
    </div>
  );
}
