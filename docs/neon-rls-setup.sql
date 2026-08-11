-- Neon RLS policies (plan Section 2 — the database-level defense-in-depth
-- layer that sits underneath the app-layer `WHERE user_id = ...` scoping
-- already enforced in every query in web/ and agent-service/).
--
-- IMPORTANT — read before running:
-- 1. As of this writing, what the plan calls "Neon Authorize" has been
--    restructured under Neon's "Data API" product surface. The underlying
--    mechanism this file depends on (the `auth.user_id()` SQL function,
--    backed by the `pg_session_jwt` extension) is unchanged and confirmed
--    current — verified directly against neon.com/docs/guides/rls-tutorial
--    and neon.com/docs/data-api/custom-authentication-providers while
--    writing this file. But Neon's own setup UI/flow for registering
--    Supabase as a trusted JWT issuer may look different from what the
--    original plan doc describes ("enable Neon Authorize"). In the Neon
--    console, look for the Data API / Row-Level Security settings and
--    configure Supabase as a custom authentication provider there, using
--    Supabase's JWKS URL: https://<project-ref>.supabase.co/auth/v1/.well-known/jwks.json
-- 2. This has NOT been run against a live Neon project — no project was
--    available during development (see TO-DO.md). Apply it, then verify
--    with two real test users signed in via the app before trusting it:
--    confirm user A genuinely cannot read user B's rows.
-- 3. Every query in web/ and agent-service/ already scopes by user_id at
--    the application layer regardless of whether this is applied — this
--    file adds the database-level backstop described in plan Section 2,
--    it does not replace anything.

-- Enable the extension Neon's JWT-based auth.user_id() depends on.
create extension if not exists pg_session_jwt;

-- ---------------------------------------------------------------------------
-- Deliberately NOT covered here: `users`. It's populated by the
-- Supabase-Auth-to-Neon sync webhook (web/src/app/api/internal/sync-user/
-- route.ts), which runs on signup *before* any Supabase session/JWT exists
-- for that person — it authenticates via a shared webhook secret instead
-- and writes through the base (non-JWT) `db` client. Enabling RLS on
-- `users` would block that insert outright (no `authenticated`-role
-- context to satisfy a policy with), breaking every signup. No
-- user-scoped code path reads `users` directly today — every other table
-- FKs to it, but the app itself never queries it — so this is a
-- considered omission, not an oversight.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Simple case: tables with a direct user_id (or, for `profiles`, `id`)
-- column. One CRUD policy set per table, scoped to the `authenticated` role.
-- ---------------------------------------------------------------------------

alter table profiles enable row level security;
create policy "profiles_select" on profiles for select to authenticated
  using (auth.user_id() = id);
create policy "profiles_insert" on profiles for insert to authenticated
  with check (auth.user_id() = id);
create policy "profiles_update" on profiles for update to authenticated
  using (auth.user_id() = id) with check (auth.user_id() = id);
create policy "profiles_delete" on profiles for delete to authenticated
  using (auth.user_id() = id);

alter table resumes enable row level security;
create policy "resumes_select" on resumes for select to authenticated
  using (auth.user_id() = user_id);
create policy "resumes_insert" on resumes for insert to authenticated
  with check (auth.user_id() = user_id);
create policy "resumes_update" on resumes for update to authenticated
  using (auth.user_id() = user_id) with check (auth.user_id() = user_id);
create policy "resumes_delete" on resumes for delete to authenticated
  using (auth.user_id() = user_id);

alter table parsed_resume_data enable row level security;
create policy "parsed_resume_data_select" on parsed_resume_data for select to authenticated
  using (auth.user_id() = user_id);
create policy "parsed_resume_data_insert" on parsed_resume_data for insert to authenticated
  with check (auth.user_id() = user_id);
create policy "parsed_resume_data_update" on parsed_resume_data for update to authenticated
  using (auth.user_id() = user_id) with check (auth.user_id() = user_id);
create policy "parsed_resume_data_delete" on parsed_resume_data for delete to authenticated
  using (auth.user_id() = user_id);

alter table matches enable row level security;
create policy "matches_select" on matches for select to authenticated
  using (auth.user_id() = user_id);
create policy "matches_insert" on matches for insert to authenticated
  with check (auth.user_id() = user_id);
create policy "matches_update" on matches for update to authenticated
  using (auth.user_id() = user_id) with check (auth.user_id() = user_id);
create policy "matches_delete" on matches for delete to authenticated
  using (auth.user_id() = user_id);

alter table applications enable row level security;
create policy "applications_select" on applications for select to authenticated
  using (auth.user_id() = user_id);
create policy "applications_insert" on applications for insert to authenticated
  with check (auth.user_id() = user_id);
create policy "applications_update" on applications for update to authenticated
  using (auth.user_id() = user_id) with check (auth.user_id() = user_id);
create policy "applications_delete" on applications for delete to authenticated
  using (auth.user_id() = user_id);

alter table agent_runs enable row level security;
create policy "agent_runs_select" on agent_runs for select to authenticated
  using (auth.user_id() = user_id);
create policy "agent_runs_insert" on agent_runs for insert to authenticated
  with check (auth.user_id() = user_id);
-- No update/delete policy for agent_runs — it's an audit log, never
-- mutated or removed once written (plan Section 7).

alter table job_search_criteria enable row level security;
create policy "job_search_criteria_select" on job_search_criteria for select to authenticated
  using (auth.user_id() = user_id);
create policy "job_search_criteria_insert" on job_search_criteria for insert to authenticated
  with check (auth.user_id() = user_id);
create policy "job_search_criteria_update" on job_search_criteria for update to authenticated
  using (auth.user_id() = user_id) with check (auth.user_id() = user_id);
create policy "job_search_criteria_delete" on job_search_criteria for delete to authenticated
  using (auth.user_id() = user_id);

-- ---------------------------------------------------------------------------
-- application_questions: no direct user_id column — ownership is via the
-- parent applications row, so policies subquery through application_id.
-- ---------------------------------------------------------------------------

alter table application_questions enable row level security;

create policy "application_questions_select" on application_questions for select to authenticated
  using (
    exists (
      select 1 from applications
      where applications.id = application_questions.application_id
        and applications.user_id = auth.user_id()
    )
  );
create policy "application_questions_insert" on application_questions for insert to authenticated
  with check (
    exists (
      select 1 from applications
      where applications.id = application_questions.application_id
        and applications.user_id = auth.user_id()
    )
  );
create policy "application_questions_update" on application_questions for update to authenticated
  using (
    exists (
      select 1 from applications
      where applications.id = application_questions.application_id
        and applications.user_id = auth.user_id()
    )
  )
  with check (
    exists (
      select 1 from applications
      where applications.id = application_questions.application_id
        and applications.user_id = auth.user_id()
    )
  );
create policy "application_questions_delete" on application_questions for delete to authenticated
  using (
    exists (
      select 1 from applications
      where applications.id = application_questions.application_id
        and applications.user_id = auth.user_id()
    )
  );

-- ---------------------------------------------------------------------------
-- job_postings: shared table, no owner. Every authenticated user can read
-- it (needed for matching/browsing); nobody using the `authenticated` role
-- can write to it — writes only happen from agent-service's own scoped
-- Neon role (plan Section 2's "service-context operations"), which needs
-- its own policy below.
--
-- Replace `job_ingest_service` with whatever role name you actually create
-- in the Neon console for agent-service's job_postings-writing connection
-- (Roles tab) — this is a real Postgres role you create yourself, Neon
-- doesn't predefine it the way it predefines `authenticated`/`anonymous`.
-- ---------------------------------------------------------------------------

alter table job_postings enable row level security;

create policy "job_postings_select_all_authenticated" on job_postings for select to authenticated
  using (true);

-- create role job_ingest_service with login password '<set a strong password, store in agent-service DATABASE_URL for the service-context connection>';
create policy "job_postings_service_write" on job_postings for all to job_ingest_service
  using (true) with check (true);
