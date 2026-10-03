import Link from "next/link";
import { requireReviewer } from "@/lib/session";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireReviewer();
  return (
    <div className="space-y-6">
      <nav aria-label="Admin" className="flex gap-4 text-sm">
        <Link href="/admin" className="underline">Review queue</Link>
        <Link href="/admin/quality" className="underline">Question quality</Link>
      </nav>
      {children}
    </div>
  );
}
