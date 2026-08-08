"use server";

import "server-only";
import { z } from "zod";
import { redirect } from "next/navigation";
import { requireUser, getCurrentSession } from "@/lib/dal/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { ingestJobPosting } from "@/lib/agent-service";
import { dbForUser } from "@/db";
import { applications } from "@/db/schema";

const schema = z.object({
  companyName: z.string().min(1).max(200),
  roleTitle: z.string().min(1).max(200),
  applicationUrl: z.url().optional().or(z.literal("")),
  jobUrl: z.url().optional().or(z.literal("")),
  jobDescription: z.string().max(20000).optional().or(z.literal("")),
});

export type NewApplicationState = { error: string | null };

export async function createApplication(
  _prevState: NewApplicationState,
  formData: FormData,
): Promise<NewApplicationState> {
  const user = await requireUser();
  const session = await getCurrentSession();
  if (!session) {
    return { error: "Session expired — please sign in again." };
  }

  const { success } = await checkRateLimit("application-create", user.id, 30, 60 * 60);
  if (!success) {
    return { error: "Too many applications created — please try again later." };
  }

  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const { companyName, roleTitle, applicationUrl, jobUrl, jobDescription } = parsed.data;

  let jobPostingId: string | undefined;
  if (jobUrl || jobDescription) {
    try {
      const result = await ingestJobPosting({
        userId: user.id,
        userAccessToken: session.access_token,
        companyName,
        title: roleTitle,
        ...(jobUrl ? { url: jobUrl } : { rawText: jobDescription as string }),
      });
      if (result.status === "complete") {
        jobPostingId = result.job_posting_id;
      }
      // If ingestion fails (bad URL, JS-rendered page, agent service down),
      // fall through and create the application without a linked posting
      // rather than blocking the tracker entry entirely — the user can
      // still fill in questions manually.
    } catch {
      // same reasoning as above.
    }
  }

  const db = dbForUser(session.access_token);
  const [application] = await db
    .insert(applications)
    .values({
      userId: user.id,
      companyName,
      roleTitle,
      applicationUrl: applicationUrl || null,
      jobPostingId: jobPostingId ?? null,
      status: "draft",
    })
    .returning();

  redirect(`/applications/${application.id}`);
}
