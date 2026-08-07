"use server";

import "server-only";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { requireUser, getCurrentSession } from "@/lib/dal/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { parseResume } from "@/lib/agent-service";
import { dbForUser } from "@/db";
import { resumes } from "@/db/schema";

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

const uploadSchema = z.object({
  storagePath: z.string().min(1),
  originalFilename: z.string().min(1).max(255),
  fileType: z.enum(["pdf", "docx"]),
  fileSizeBytes: z.coerce.number().int().positive().max(MAX_FILE_SIZE_BYTES),
});

export type UploadActionState = { error: string | null };

/**
 * Called after the browser has already uploaded the file directly to
 * Supabase Storage (see resume-upload-form.tsx). Records the `resumes` row,
 * mints a short-lived signed download URL for the agent service, and waits
 * for the resume-parser agent to finish before redirecting to the review
 * page. Synchronous for now — Phase 1 has no background job queue yet.
 */
export async function recordUploadAndParse(
  _prevState: UploadActionState,
  formData: FormData,
): Promise<UploadActionState> {
  const user = await requireUser();
  const session = await getCurrentSession();
  if (!session) {
    return { error: "Session expired — please sign in again." };
  }

  const { success } = await checkRateLimit("resume-upload", user.id, 10, 60 * 60);
  if (!success) {
    return { error: "Too many uploads — please try again later." };
  }

  const parsed = uploadSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid upload." };
  }
  const { storagePath, originalFilename, fileType, fileSizeBytes } = parsed.data;

  // Defense in depth: the storage RLS policy already restricts uploads to
  // `{auth.uid()}/...`, but verify server-side too before trusting the path.
  if (!storagePath.startsWith(`${user.id}/`)) {
    return { error: "Invalid storage path." };
  }

  const db = dbForUser(session.access_token);
  const [resume] = await db
    .insert(resumes)
    .values({
      userId: user.id,
      storagePath,
      originalFilename,
      fileType,
      fileSizeBytes,
      parseStatus: "processing",
    })
    .returning();

  const supabase = await createClient();
  const { data: signedUrlData, error: signError } = await supabase.storage
    .from("resumes")
    .createSignedUrl(storagePath, 600);

  if (signError || !signedUrlData) {
    await db.update(resumes).set({ parseStatus: "failed" }).where(eq(resumes.id, resume.id));
    return { error: "Could not access the uploaded file. Please try again." };
  }

  try {
    const result = await parseResume({
      resumeId: resume.id,
      userId: user.id,
      userAccessToken: session.access_token,
      signedDownloadUrl: signedUrlData.signedUrl,
      fileType,
    });
    if (result.status !== "complete") {
      return { error: result.error ?? "Parsing failed. You can review and retry from the resume page." };
    }
  } catch {
    // The agent service updates `resumes.parse_status` itself on
    // success/failure; if the call fails entirely (network, timeout), leave
    // the row as `processing` and let the user retry from the review page
    // rather than guessing at partial state here.
    return {
      error: "Parsing is taking longer than expected. Check the resume page shortly.",
    };
  }

  redirect(`/resume/${resume.id}`);
}
