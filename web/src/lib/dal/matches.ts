import "server-only";
import { cache } from "react";
import { and, desc, eq, ne } from "drizzle-orm";
import { dbForUser } from "@/db";
import { matches, jobPostings } from "@/db/schema";
import { requireUser, getCurrentSession } from "./auth";

export const getOwnMatches = cache(async () => {
  const user = await requireUser();
  const session = await getCurrentSession();
  if (!session) return [];

  const db = dbForUser(session.access_token);
  return db
    .select({
      id: matches.id,
      overallScore: matches.overallScore,
      scoreBreakdown: matches.scoreBreakdown,
      matchRationale: matches.matchRationale,
      status: matches.status,
      jobPostingId: jobPostings.id,
      companyName: jobPostings.companyName,
      title: jobPostings.title,
      locationText: jobPostings.locationText,
      isRemote: jobPostings.isRemote,
      descriptionUrl: jobPostings.descriptionUrl,
    })
    .from(matches)
    .innerJoin(jobPostings, eq(matches.jobPostingId, jobPostings.id))
    .where(and(eq(matches.userId, user.id), ne(matches.status, "dismissed")))
    .orderBy(desc(matches.overallScore));
});
