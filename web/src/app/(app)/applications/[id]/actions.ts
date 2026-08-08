"use server";

import "server-only";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireUser, getCurrentSession } from "@/lib/dal/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { draftAnswers as draftAnswersOnAgentService } from "@/lib/agent-service";
import { dbForUser } from "@/db";
import { applications, applicationQuestions } from "@/db/schema";

async function requireOwnedApplication(applicationId: string) {
  const user = await requireUser();
  const session = await getCurrentSession();
  if (!session) {
    throw new Error("Session expired");
  }
  const db = dbForUser(session.access_token);
  const [application] = await db
    .select()
    .from(applications)
    .where(and(eq(applications.id, applicationId), eq(applications.userId, user.id)))
    .limit(1);
  if (!application) {
    throw new Error("Application not found");
  }
  return { user, session, db, application };
}

export type ActionState = { error: string | null };
const okState: ActionState = { error: null };

const statusSchema = z.enum([
  "draft",
  "form_filled_pending_review",
  "submitted_by_user",
  "rejected",
  "interviewing",
  "offer",
  "withdrawn",
]);

export async function updateStatus(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const applicationId = String(formData.get("applicationId"));
  const statusParsed = statusSchema.safeParse(formData.get("status"));
  if (!statusParsed.success) {
    return { error: "Invalid status." };
  }

  const { db, application } = await requireOwnedApplication(applicationId);
  await db
    .update(applications)
    .set({
      status: statusParsed.data,
      userSubmittedAt:
        statusParsed.data === "submitted_by_user" && !application.userSubmittedAt
          ? new Date()
          : application.userSubmittedAt,
      updatedAt: new Date(),
    })
    .where(eq(applications.id, applicationId));

  revalidatePath(`/applications/${applicationId}`);
  revalidatePath("/applications");
  return okState;
}

export async function updateNotes(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const applicationId = String(formData.get("applicationId"));
  const notes = String(formData.get("notes") ?? "").slice(0, 5000);

  const { db } = await requireOwnedApplication(applicationId);
  await db
    .update(applications)
    .set({ notes, updatedAt: new Date() })
    .where(eq(applications.id, applicationId));

  revalidatePath(`/applications/${applicationId}`);
  return okState;
}

const addQuestionSchema = z.object({
  questionText: z.string().min(1).max(2000),
  questionType: z.enum(["short_text", "long_text", "multiple_choice", "yes_no", "file_upload"]),
  answerMode: z.enum(["agent", "user"]),
});

export async function addQuestion(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const applicationId = String(formData.get("applicationId"));
  const parsed = addQuestionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid question." };
  }

  const { db } = await requireOwnedApplication(applicationId);
  const existing = await db
    .select({ id: applicationQuestions.id })
    .from(applicationQuestions)
    .where(eq(applicationQuestions.applicationId, applicationId));

  await db.insert(applicationQuestions).values({
    applicationId,
    questionText: parsed.data.questionText,
    questionType: parsed.data.questionType,
    answeredBy: parsed.data.answerMode,
    orderIndex: existing.length,
  });

  revalidatePath(`/applications/${applicationId}`);
  return okState;
}

export async function saveAnswer(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const applicationId = String(formData.get("applicationId"));
  const questionId = String(formData.get("questionId"));
  const answerText = String(formData.get("answerText") ?? "").slice(0, 5000);

  const { db } = await requireOwnedApplication(applicationId);
  await db
    .update(applicationQuestions)
    .set({ answerText })
    .where(
      and(
        eq(applicationQuestions.id, questionId),
        eq(applicationQuestions.applicationId, applicationId),
      ),
    );

  revalidatePath(`/applications/${applicationId}`);
  return okState;
}

export async function deleteQuestion(formData: FormData): Promise<void> {
  const applicationId = String(formData.get("applicationId"));
  const questionId = String(formData.get("questionId"));

  const { db } = await requireOwnedApplication(applicationId);
  await db
    .delete(applicationQuestions)
    .where(
      and(
        eq(applicationQuestions.id, questionId),
        eq(applicationQuestions.applicationId, applicationId),
      ),
    );

  revalidatePath(`/applications/${applicationId}`);
}

export async function draftPendingAnswers(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const applicationId = String(formData.get("applicationId"));
  const { user, session } = await requireOwnedApplication(applicationId);

  const { success } = await checkRateLimit("draft-answers", user.id, 20, 60 * 60);
  if (!success) {
    return { error: "Too many drafting requests — please try again later." };
  }

  const result = await draftAnswersOnAgentService({
    applicationId,
    userId: user.id,
    userAccessToken: session.access_token,
  });
  if (result.status !== "complete") {
    return { error: result.error ?? "Drafting failed. Please try again." };
  }

  revalidatePath(`/applications/${applicationId}`);
  return okState;
}
