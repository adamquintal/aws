import { notFound, redirect } from "next/navigation";
import { requireEnrollment } from "@/lib/session";
import { loadGates, statusesFor } from "@/lib/services/learning";
import { ExplainBackForm } from "@/components/ExplainBackForm";

export const metadata = { title: "Explain it back" };
export const dynamic = "force-dynamic";

export default async function Explain({ params }: { params: Promise<{ topicId: string }> }) {
  const { topicId } = await params;
  const { user, track } = await requireEnrollment();
  const topic = track.topics.find((t) => t.id === topicId);
  if (!topic?.lesson) notFound();
  const status = statusesFor(track, await loadGates(user.id, track)).get(topic.id);
  if (status === "mastered") redirect(`/topics/${topic.id}`);
  if (status !== "explain-back") redirect("/today");
  return <ExplainBackForm topicId={topic.id} title={topic.title} prompt={topic.lesson.explainBack.prompt} modelAnswer={topic.lesson.explainBack.modelAnswer} />;
}
