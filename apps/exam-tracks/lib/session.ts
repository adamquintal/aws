import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { getTrack } from "@/lib/content/load";

export async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user) redirect("/signin");
  return user;
}

export async function requireReviewer() {
  const user = await requireUser();
  if (user.role === "LEARNER") redirect("/today");
  return user;
}

/** The learner's active track; sends them to onboarding if they have none. */
export async function requireEnrollment() {
  const user = await requireUser();
  const enrollment = await prisma.enrollment.findFirst({
    where: { userId: user.id, active: true },
    orderBy: { startedAt: "desc" },
  });
  if (!enrollment) redirect("/onboarding");
  const track = getTrack(enrollment.trackId);
  if (!track) redirect("/onboarding");
  return { user, enrollment, track };
}
