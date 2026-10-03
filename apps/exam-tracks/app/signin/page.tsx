import { redirect } from "next/navigation";
import { auth, devLoginEnabled, enabledProviders, passcodeLoginEnabled } from "@/auth";
import { devSignIn, emailSignIn, oauthSignIn, passcodeSignIn } from "@/app/actions";

export const metadata = { title: "Sign in" };

export default async function SignIn({ searchParams }: { searchParams: Promise<{ check?: string; error?: string }> }) {
  if ((await auth())?.user) redirect("/today");
  const { check, error } = await searchParams;
  const oauth = enabledProviders.filter((p) => p.type === "oauth" || p.type === "oidc");
  const email = enabledProviders.some((p) => p.type === "email");
  return (
    <div className="mx-auto max-w-sm space-y-6">
      <h1 className="text-2xl font-semibold">Sign in</h1>
      {check && <p role="status" className="card">Check your email for a sign-in link.</p>}
      {error && <p role="alert" className="card text-gentle">{error === "passcode" ? "That email and passcode didn't match. Please try again." : "That didn't work. Please try again."}</p>}
      {passcodeLoginEnabled && (
        <form action={passcodeSignIn} className="space-y-2">
          <label htmlFor="pc-email" className="label">Email</label>
          <input id="pc-email" name="email" type="email" required autoComplete="email" className="input" />
          <label htmlFor="passcode" className="label">Passcode</label>
          <input id="passcode" name="passcode" type="password" required autoComplete="current-password" className="input" />
          <button className="btn-primary w-full">Sign in</button>
        </form>
      )}
      {email && (
        <form action={emailSignIn} className="space-y-2">
          <label htmlFor="email" className="label">Email (we'll send you a magic link)</label>
          <input id="email" name="email" type="email" required autoComplete="email" className="input" />
          <button className="btn-primary w-full">Email me a link</button>
        </form>
      )}
      {oauth.map((p) => (
        <form key={p.id} action={oauthSignIn.bind(null, p.id)}>
          <button className="btn-ghost w-full">Continue with {p.name}</button>
        </form>
      ))}
      {devLoginEnabled && (
        <form action={devSignIn} className="space-y-2 rounded-2xl border border-dashed border-border p-4">
          <label htmlFor="dev-email" className="label">Dev login (local only)</label>
          <input id="dev-email" name="email" type="email" required className="input" placeholder="you@example.com" />
          <button className="btn-ghost w-full">Sign in without a password</button>
        </form>
      )}
      {!email && !oauth.length && !devLoginEnabled && !passcodeLoginEnabled && (
        <p className="text-muted">No sign-in methods are configured. See the README.</p>
      )}
    </div>
  );
}
