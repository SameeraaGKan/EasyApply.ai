import "server-only";
import { cache } from "react";
import { and, asc, desc, eq } from "drizzle-orm";
import { dbForUser } from "@/db";
import { applications, applicationQuestions } from "@/db/schema";
import { requireUser, getCurrentSession } from "./auth";

export const getOwnApplications = cache(async () => {
  const user = await requireUser();
  const session = await getCurrentSession();
  if (!session) return [];

  const db = dbForUser(session.access_token);
  return db
    .select()
    .from(applications)
    .where(eq(applications.userId, user.id))
    .orderBy(desc(applications.createdAt));
});

export const getOwnApplicationWithQuestions = cache(async (applicationId: string) => {
  const user = await requireUser();
  const session = await getCurrentSession();
  if (!session) return null;

  const db = dbForUser(session.access_token);
  const [application] = await db
    .select()
    .from(applications)
    .where(and(eq(applications.id, applicationId), eq(applications.userId, user.id)))
    .limit(1);
  if (!application) return null;

  const questions = await db
    .select()
    .from(applicationQuestions)
    .where(eq(applicationQuestions.applicationId, applicationId))
    .orderBy(asc(applicationQuestions.orderIndex));

  return { application, questions };
});
