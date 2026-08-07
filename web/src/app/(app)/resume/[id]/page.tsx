import { notFound } from "next/navigation";
import { getOwnResumeWithParsedData } from "@/lib/dal/resumes";
import { ParsedDataEditor } from "./parsed-data-editor";
import { StatusPoller } from "./status-poller";

export default async function ResumeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const result = await getOwnResumeWithParsedData(id);
  if (!result) {
    notFound();
  }
  const { resume, parsed } = result;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">{resume.originalFilename}</h1>

      {resume.parseStatus !== "complete" && (
        <div className="rounded border border-neutral-200 p-4 text-sm text-neutral-500 dark:border-neutral-800">
          {resume.parseStatus === "failed"
            ? "Parsing failed. Try uploading the resume again from the Resume page."
            : "Parsing in progress — this page will update automatically."}
          {resume.parseStatus !== "failed" && <StatusPoller />}
        </div>
      )}

      {parsed && (
        <ParsedDataEditor
          resumeId={resume.id}
          initialSkills={(parsed.skills as { name: string; category?: string; yearsExperience?: number }[]) ?? []}
          initialExperience={
            (parsed.workExperience as {
              company: string;
              title: string;
              startDate?: string;
              endDate?: string;
              description?: string;
            }[]) ?? []
          }
          initialEducation={
            (parsed.education as {
              institution: string;
              degree?: string;
              field?: string;
              graduationDate?: string;
            }[]) ?? []
          }
          initialTotalYearsExperience={
            parsed.totalYearsExperience ? Number(parsed.totalYearsExperience) : null
          }
          initialSeniorityLevel={parsed.seniorityLevel}
        />
      )}
    </div>
  );
}
