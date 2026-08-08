import { notFound } from "next/navigation";
import { getOwnApplicationWithQuestions } from "@/lib/dal/applications";
import { StatusNotesPanel } from "./status-notes-panel";
import { QuestionList } from "./question-list";
import { AddQuestionForm } from "./add-question-form";

export default async function ApplicationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const result = await getOwnApplicationWithQuestions(id);
  if (!result) {
    notFound();
  }
  const { application, questions } = result;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold">{application.roleTitle}</h1>
        <p className="text-neutral-500">{application.companyName}</p>
        {application.applicationUrl && (
          <a
            href={application.applicationUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm underline"
          >
            Application link
          </a>
        )}
      </div>

      <StatusNotesPanel
        applicationId={application.id}
        status={application.status}
        notes={application.notes ?? ""}
      />

      <section className="flex flex-col gap-4">
        <h2 className="font-medium">Application questions</h2>
        <p className="text-sm text-neutral-500">
          Add any custom questions from the application. By default the agent drafts an answer —
          switch a question to &quot;I&apos;ll answer&quot; if you&apos;d rather write it
          yourself.
        </p>
        <QuestionList applicationId={application.id} questions={questions} />
        <AddQuestionForm applicationId={application.id} />
      </section>
    </div>
  );
}
