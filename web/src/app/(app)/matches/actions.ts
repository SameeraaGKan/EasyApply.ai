"use server";

import "server-only";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireUser, getCurrentSession } from "@/lib/dal/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { ingestJobBoard, runMatcher } from "@/lib/agent-service";
import { dbForUser } from "@/db";
import { matches } from "@/db/schema";

export type ActionState = { error: string | null };
const okState: ActionState = { error: null };

const ingestSchema = z.object({
  source: z.enum(["greenhouse", "lever", "ashby"]),
  companyToken: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9-]+$/i, "Use the company's board token (letters, numbers, hyphens only)"),
});

export async function ingestFromJobBoard(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const session = await getCurrentSession();
  if (!session) {
    return { error: "Session expired — please sign in again." };
  }

  const { success } = await checkRateLimit("job-board-ingest", user.id, 10, 60 * 60);
  if (!success) {
    return { error: "Too many ingestion requests — please try again later." };
  }

  const parsed = ingestSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const result = await ingestJobBoard({
    userId: user.id,
    userAccessToken: session.access_token,
    source: parsed.data.source,
    companyToken: parsed.data.companyToken,
  });
  if (result.status !== "complete") {
    return { error: result.error ?? "Ingestion failed." };
  }
  if (result.ingested_count === 0 && result.skipped_count === 0) {
    return { error: "No postings found for that company token — double-check it's correct." };
  }

  revalidatePath("/matches");
  return okState;
}

export async function findMatches(
  _prevState: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const session = await getCurrentSession();
  if (!session) {
    return { error: "Session expired — please sign in again." };
  }

  const { success } = await checkRateLimit("find-matches", user.id, 20, 60 * 60);
  if (!success) {
    return { error: "Too many match requests — please try again later." };
  }

  const result = await runMatcher({ userId: user.id, userAccessToken: session.access_token });
  if (result.status !== "complete") {
    return { error: result.error ?? "Matching failed. Upload and parse a resume first." };
  }

  revalidatePath("/matches");
  return okState;
}

const statusSchema = z.enum(["shortlisted", "dismissed"]);

export async function updateMatchStatus(matchId: string, status: string): Promise<void> {
  const user = await requireUser();
  const session = await getCurrentSession();
  if (!session) return;

  const parsedStatus = statusSchema.safeParse(status);
  if (!parsedStatus.success) return;

  const db = dbForUser(session.access_token);
  await db
    .update(matches)
    .set({ status: parsedStatus.data })
    .where(and(eq(matches.id, matchId), eq(matches.userId, user.id)));

  revalidatePath("/matches");
}
