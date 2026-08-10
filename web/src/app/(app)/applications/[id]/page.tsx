import { notFound } from "next/navigation";
import { getOwnApplicationWithQuestions } from "@/lib/dal/applications";
import { createClient } from "@/lib/supabase/server";
import { StatusNotesPanel } from "./status-notes-panel";
import { QuestionList } from "./question-list";
import { AddQuestionForm } from "./add-question-form";
import { FillApplicationPanel } from "./fill-application-panel";

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

  let screenshotUrl: string | null = null;
  if (application.formScreenshotStoragePath) {
    const supabase = await createClient();
    const { data } = await supabase.storage
      .from("application-screenshots")
      .createSignedUrl(application.formScreenshotStoragePath, 600);
    screenshotUrl = data?.signedUrl ?? null;
  }

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

      {application.applicationUrl && (
        <section className="flex flex-col gap-4">
          <FillApplicationPanel applicationId={application.id} />

          {screenshotUrl && (
            <div className="flex flex-col gap-2">
              <h2 className="font-medium">Last review screenshot</h2>
              <p className="text-sm text-neutral-500">
                What the agent filled in, right before the submit button — go submit it yourself
                on the real page, then mark this application &quot;Submitted&quot; above.
              </p>
              {/* eslint-disable-next-line @next/next/no-img-element -- signed Supabase Storage URL, not a static/optimizable asset */}
              <img
                src={screenshotUrl}
                alt="Filled application form, before submit"
                className="max-w-full rounded border border-neutral-200 dark:border-neutral-800"
              />
            </div>
          )}
        </section>
      )}
    </div>
  );
}
