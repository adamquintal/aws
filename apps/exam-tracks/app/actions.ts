"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getTrack } from "@/lib/content/load";
import { requireEnrollment, requireReviewer, requireUser } from "@/lib/session";
import { buildDailySession, recordAnswer, submitExplainBack } from "@/lib/services/learning";
import { saveProgress, startExam as startExamSvc, submitExam as submitExamSvc } from "@/lib/services/exams";
import { signIn } from "@/auth";
import { AuthError } from "next-auth";

export async function devSignIn(formData: FormData) {
  await signIn("dev", { email: formData.get("email"), redirectTo: "/today" });
}
export async function passcodeSignIn(formData: FormData) {
  try {
    await signIn("passcode", { email: formData.get("email"), passcode: formData.get("passcode"), redirectTo: "/today" });
  } catch (e) {
    if (e instanceof AuthError) redirect(e.type === "CredentialsSignin" ? "/signin?error=passcode" : "/signin?error=1");
    throw e;
  }
}
export async function emailSignIn(formData: FormData) {
  await signIn("nodemailer", { email: formData.get("email"), redirectTo: "/today" });
}
export async function oauthSignIn(provider: string) {
  await signIn(provider, { redirectTo: "/today" });
}

const enrollSchema = z.object({
  trackId: z.string(),
  examDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal("")).optional(),
  timezone: z.string().optional(),
  name: z.string().max(80).optional(),
});

export async function enroll(formData: FormData) {
  const user = await requireUser();
  const data = enrollSchema.parse(Object.fromEntries(formData));
  if (!getTrack(data.trackId)) throw new Error("Unknown track");
  const examDate = data.examDate ? new Date(`${data.examDate}T00:00:00Z`) : null;
  await prisma.$transaction([
    prisma.enrollment.updateMany({ where: { userId: user.id }, data: { active: false } }),
    prisma.enrollment.upsert({
      where: { userId_trackId: { userId: user.id, trackId: data.trackId } },
      create: { userId: user.id, trackId: data.trackId, examDate },
      update: { active: true, examDate },
    }),
    prisma.user.update({
      where: { id: user.id },
      data: {
        ...(data.timezone && isValidTz(data.timezone) ? { timezone: data.timezone } : {}),
        ...(data.name ? { name: data.name } : {}),
      },
    }),
  ]);
  redirect("/today");
}

function isValidTz(tz: string) {
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export async function updateProfile(formData: FormData) {
  const user = await requireUser();
  const name = String(formData.get("name") ?? "").slice(0, 80);
  const timezone = String(formData.get("timezone") ?? "");
  const examDate = String(formData.get("examDate") ?? "");
  await prisma.user.update({ where: { id: user.id }, data: { name: name || null, ...(isValidTz(timezone) ? { timezone } : {}) } });
  await prisma.enrollment.updateMany({
    where: { userId: user.id, active: true },
    data: { examDate: /^\d{4}-\d{2}-\d{2}$/.test(examDate) ? new Date(`${examDate}T00:00:00Z`) : null },
  });
  revalidatePath("/settings");
}

export async function startSession() {
  const { user, track } = await requireEnrollment();
  return buildDailySession(user.id, track);
}

const answerSchema = z.object({
  questionId: z.string(),
  selected: z.array(z.string().regex(/^[a-z]$/)).min(1).max(6),
  hintUsed: z.boolean(),
  durationMs: z.number().nonnegative(),
  kind: z.enum(["warmup", "review", "learn"]),
});

export async function submitAnswer(input: z.infer<typeof answerSchema>) {
  const { user, track } = await requireEnrollment();
  const a = answerSchema.parse(input);
  return recordAnswer({ userId: user.id, timezone: user.timezone, track, ...a });
}

export async function explainBack(formData: FormData) {
  const { user, track } = await requireEnrollment();
  const topicId = String(formData.get("topicId"));
  const text = String(formData.get("text") ?? "").trim().slice(0, 5000);
  const selfRating = z.enum(["matches", "partly", "missed"]).parse(formData.get("selfRating"));
  if (text.length < 20) throw new Error("Please write a sentence or two in your own words first.");
  await submitExplainBack({ userId: user.id, track, topicId, text, selfRating });
  redirect(`/topics/${topicId}?mastered=1`);
}

// ---------- Exams ----------

export async function startExam(formData: FormData) {
  const { user, track } = await requireEnrollment();
  const kind = z.enum(["diagnostic", "mock"]).parse(formData.get("kind"));
  const id = await startExamSvc(user.id, track, kind);
  redirect(`/exams/${id}`);
}

export async function saveExamProgress(id: string, answers: unknown) {
  const { user, track } = await requireEnrollment();
  return saveProgress(user.id, track, z.string().parse(id), answers);
}

export async function submitExam(id: string, answers: unknown) {
  const { user, track } = await requireEnrollment();
  await submitExamSvc(user.id, track, z.string().parse(id), answers);
  revalidatePath("/exams");
  return { ok: true as const };
}

export async function recordPlaygroundSolve(challengeId: string, query: string) {
  const user = await requireUser();
  const { CHALLENGES } = await import("@/lib/promql/challenges");
  const c = CHALLENGES.find((x) => x.id === challengeId);
  if (!c) return { ok: false as const };
  // Re-check on the server so solves can't be recorded for wrong answers.
  const { checkChallenge } = await import("@/lib/promql/challenges");
  const { getEngine } = await import("@/lib/promql/shared");
  const q = String(query).slice(0, 2000);
  if (!checkChallenge(getEngine(), c, q).solved) return { ok: false as const };
  await prisma.playgroundSolve.upsert({
    where: { userId_challengeId: { userId: user.id, challengeId } },
    create: { userId: user.id, challengeId, query: q },
    update: {},
  });
  return { ok: true as const };
}

const flagSchema = z.object({
  questionId: z.string(),
  questionVersion: z.number().int(),
  reason: z.enum(["wrong_answer", "unclear", "outdated", "typo", "other"]),
  message: z.string().max(2000).optional(),
});

export async function reportProblem(input: z.infer<typeof flagSchema>) {
  const user = await requireUser();
  const f = flagSchema.parse(input);
  // Light rate limit: at most 20 reports per user per day.
  const recent = await prisma.flag.count({ where: { userId: user.id, createdAt: { gte: new Date(Date.now() - 86_400_000) } } });
  if (recent >= 20) return { ok: false as const };
  await prisma.flag.create({ data: { ...f, userId: user.id } });
  return { ok: true as const };
}

export async function deleteAccount(formData: FormData) {
  const user = await requireUser();
  if (String(formData.get("confirm")).trim().toLowerCase() !== "delete") throw new Error('Type "delete" to confirm.');
  // Reviews reference the reviewer; keep the decision history but detach it from a deleted admin.
  await prisma.$transaction([
    prisma.reviewDecision.deleteMany({ where: { reviewerId: user.id, appliedAt: null } }),
    prisma.readinessSnapshot.deleteMany({ where: { userId: user.id } }),
    prisma.user.delete({ where: { id: user.id } }),
  ]);
  redirect("/?deleted=1");
}

// ---------- Admin ----------

const reviewSchema = z.object({
  itemId: z.string(),
  version: z.coerce.number().int(),
  status: z.enum(["draft", "source_checked", "human_verified"]),
  note: z.string().max(2000).optional(),
});

export async function recordReview(formData: FormData) {
  const reviewer = await requireReviewer();
  const r = reviewSchema.parse(Object.fromEntries(formData));
  await prisma.reviewDecision.create({ data: { ...r, note: r.note || null, reviewerId: reviewer.id } });
  revalidatePath("/admin");
  revalidatePath(`/admin/items/${encodeURIComponent(r.itemId)}`);
}

export async function setFlagStatus(formData: FormData) {
  await requireReviewer();
  const id = String(formData.get("id"));
  const status = z.enum(["open", "resolved", "dismissed"]).parse(formData.get("status"));
  await prisma.flag.update({ where: { id }, data: { status } });
  revalidatePath("/admin/quality");
}
