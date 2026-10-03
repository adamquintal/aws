import { notFound, redirect } from "next/navigation";
import { requireEnrollment } from "@/lib/session";
import { deadline, getAttempt, publicQuestions } from "@/lib/services/exams";
import type { ExamAnswers } from "@/lib/engine/exam";
import { ExamRunner } from "@/components/ExamRunner";

export const metadata = { title: "Exam" };
export const dynamic = "force-dynamic";

export default async function ExamPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, track } = await requireEnrollment();
  const found = await getAttempt(user.id, track, id);
  if (!found) notFound();
  if (found.attempt.submittedAt) redirect(`/exams/${id}/results`);
  const end = deadline(found.attempt);
  return (
    <ExamRunner
      attemptId={id}
      kind={found.attempt.kind as "diagnostic" | "mock"}
      questions={publicQuestions(track, id, found.questions)}
      initialAnswers={(found.attempt.answers ?? {}) as ExamAnswers}
      deadlineMs={end ? end.getTime() : null}
      serverNowMs={Date.now()}
    />
  );
}
