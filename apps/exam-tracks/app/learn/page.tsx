import { requireEnrollment } from "@/lib/session";
import { buildDailySession } from "@/lib/services/learning";
import { QuestionRunner } from "@/components/QuestionRunner";

export const metadata = { title: "Session" };
export const dynamic = "force-dynamic";

export default async function Learn() {
  const { user, track } = await requireEnrollment();
  const session = await buildDailySession(user.id, track);
  return <QuestionRunner initial={session} />;
}
