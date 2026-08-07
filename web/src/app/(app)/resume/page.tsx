import Link from "next/link";
import { requireUser } from "@/lib/dal/auth";
import { getOwnResumes } from "@/lib/dal/resumes";
import { ResumeUploadForm } from "./resume-upload-form";

export default async function ResumePage() {
  const user = await requireUser();
  const ownResumes = await getOwnResumes();

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-2xl font-semibold">Resume</h1>
      <ResumeUploadForm userId={user.id} />

      {ownResumes.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="font-medium">Uploaded resumes</h2>
          <ul className="flex flex-col divide-y divide-neutral-200 dark:divide-neutral-800">
            {ownResumes.map((r) => (
              <li key={r.id} className="flex items-center justify-between py-3">
                <Link href={`/resume/${r.id}`} className="underline">
                  {r.originalFilename}
                </Link>
                <span className="text-sm text-neutral-500">{r.parseStatus}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
