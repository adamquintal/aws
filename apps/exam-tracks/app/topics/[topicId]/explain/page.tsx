import { notFound, redirect } from "next/navigation";
import { requireEnrollment } from "@/lib/session";
import { loadGates, statusesFor } from "@/lib/services/learning";
import { ExplainBackForm } from "@/components/ExplainBackForm";
import { FocusHeader } from "@/components/FocusHeader";
import { Stepper } from "@/components/Stepper";

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
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="page flex flex-col gap-5 pt-12">
        <FocusHeader href="/today" label={`Topic ${topic.index + 1} of ${track.topics.length}`} />
        <Stepper current="Explain" done={["Learn", "Practice"]} />
      </header>
      <ExplainBackForm topicId={topic.id} title={topic.title} prompt={topic.lesson.explainBack.prompt} modelAnswer={topic.lesson.explainBack.modelAnswer} />
    </div>
  );
}
