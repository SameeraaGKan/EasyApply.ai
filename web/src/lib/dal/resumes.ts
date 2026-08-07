import "server-only";
import { cache } from "react";
import { and, desc, eq } from "drizzle-orm";
import { dbForUser } from "@/db";
import { resumes, parsedResumeData } from "@/db/schema";
import { requireUser, getCurrentSession } from "./auth";

export const getOwnResumes = cache(async () => {
  const user = await requireUser();
  const session = await getCurrentSession();
  if (!session) return [];

  const db = dbForUser(session.access_token);
  return db
    .select()
    .from(resumes)
    .where(eq(resumes.userId, user.id))
    .orderBy(desc(resumes.createdAt));
});

export const getOwnResumeWithParsedData = cache(async (resumeId: string) => {
  const user = await requireUser();
  const session = await getCurrentSession();
  if (!session) return null;

  const db = dbForUser(session.access_token);
  const [resume] = await db
    .select()
    .from(resumes)
    .where(and(eq(resumes.id, resumeId), eq(resumes.userId, user.id)))
    .limit(1);
  if (!resume) return null;

  const [parsed] = await db
    .select()
    .from(parsedResumeData)
    .where(eq(parsedResumeData.resumeId, resumeId))
    .orderBy(desc(parsedResumeData.createdAt))
    .limit(1);

  return { resume, parsed: parsed ?? null };
});
