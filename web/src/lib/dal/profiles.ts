import "server-only";
import { cache } from "react";
import { eq } from "drizzle-orm";
import { dbForUser } from "@/db";
import { profiles } from "@/db/schema";
import { requireUser, getCurrentSession } from "./auth";

/** Request-scoped cached fetch of the signed-in user's profile row (or null
 * if they haven't completed onboarding yet). Always goes through
 * `dbForUser` so Neon RLS applies to the query. */
export const getOwnProfile = cache(async () => {
  const user = await requireUser();
  const session = await getCurrentSession();
  if (!session) return null;

  const db = dbForUser(session.access_token);
  const [profile] = await db.select().from(profiles).where(eq(profiles.id, user.id)).limit(1);
  return profile ?? null;
});
