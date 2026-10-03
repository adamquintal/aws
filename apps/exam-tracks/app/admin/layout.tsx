import Link from "next/link";
import { requireReviewer } from "@/lib/session";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireReviewer();
  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 px-6 pb-16 pt-10">
      <nav aria-label="Admin" className="flex items-center gap-5 text-sm">
        <Link href="/settings" className="text-muted">← Settings</Link>
        <Link href="/admin" className="link">Review queue</Link>
        <Link href="/admin/quality" className="link">Question quality</Link>
      </nav>
      {children}
    </div>
  );
}
