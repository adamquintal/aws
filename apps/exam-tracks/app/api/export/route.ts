import { auth } from "@/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });
  const userId = session.user.id;
  const [user, enrollments, attempts, topicProgress, reviewCards, studyDays, explainBacks, flags, readiness] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, email: true, timezone: true, role: true, createdAt: true } }),
    prisma.enrollment.findMany({ where: { userId } }),
    prisma.attempt.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
    prisma.topicProgress.findMany({ where: { userId } }),
    prisma.reviewCard.findMany({ where: { userId } }),
    prisma.studyDay.findMany({ where: { userId } }),
    prisma.explainBack.findMany({ where: { userId } }),
    prisma.flag.findMany({ where: { userId } }),
    prisma.readinessSnapshot.findMany({ where: { userId } }),
  ]);
  const body = JSON.stringify({ exportedAt: new Date().toISOString(), user, enrollments, attempts, topicProgress, reviewCards, studyDays, explainBacks, flags, readiness }, null, 2);
  return new Response(body, {
    headers: {
      "content-type": "application/json",
      "content-disposition": `attachment; filename="exam-tracks-export-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
}
