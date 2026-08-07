import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

const sql = neon(connectionString);

/**
 * Base client. Only safe to use for operations that don't touch RLS-protected
 * user-owned tables (e.g. before Neon RLS/Authorize is configured, or for
 * genuinely unauthenticated reads of the shared `job_postings` table).
 */
export const db = drizzle(sql, { schema });

/**
 * Per-request, RLS-scoped client. Pass the caller's verified Supabase JWT so
 * Neon Authorize enforces row ownership at the database level for every
 * query issued through the returned client — this is the client that must be
 * used for any query touching a user-owned table (profiles, resumes,
 * parsed_resume_data, matches, applications, application_questions,
 * agent_runs, job_search_criteria).
 *
 * Requires Neon RLS (Neon Authorize) to be configured on the Neon project
 * with Supabase Auth registered as a trusted JWT issuer — see README.
 */
export function dbForUser(supabaseAccessToken: string) {
  return db.$withAuth(supabaseAccessToken);
}
