import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { ThemeToggle } from "@/components/ThemeToggle";
import { auth, signOut } from "@/auth";

export const metadata: Metadata = {
  title: { default: "Exam Tracks", template: "%s · Exam Tracks" },
  description: "Calm, steady study tracks that build real confidence.",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const role = session?.user?.role;
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen">
        <Providers>
          <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 btn-primary">
            Skip to content
          </a>
          <header className="border-b border-border bg-surface">
            <nav aria-label="Main" className="mx-auto flex max-w-4xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
              <Link href="/" className="mr-auto font-semibold">Exam Tracks</Link>
              {session?.user && (
                <>
                  <Link href="/today" className="text-sm hover:underline">Today</Link>
                  <Link href="/topics" className="text-sm hover:underline">Topics</Link>
                  <Link href="/dashboard" className="text-sm hover:underline">Progress</Link>
                  <Link href="/settings" className="text-sm hover:underline">Settings</Link>
                  {role && role !== "LEARNER" && <Link href="/admin" className="text-sm hover:underline">Admin</Link>}
                </>
              )}
              <ThemeToggle />
              {session?.user && (
                <form action={async () => { "use server"; await signOut({ redirectTo: "/" }); }}>
                  <button className="text-sm text-muted hover:underline">Sign out</button>
                </form>
              )}
            </nav>
          </header>
          <main id="main" className="mx-auto max-w-4xl px-4 py-6 sm:py-10">{children}</main>
          <footer className="mx-auto max-w-4xl px-4 pb-10 text-xs text-muted">
            Independent study material. Not affiliated with or endorsed by the CNCF or the Linux Foundation.
          </footer>
        </Providers>
      </body>
    </html>
  );
}
