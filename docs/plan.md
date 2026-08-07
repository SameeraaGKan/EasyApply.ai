# EasyApply.ai — Implementation Plan

## Context

This is a greenfield project (empty folder, named `EasyApply.ai` — the project takes that name). The goal is a multi-agent, agentic-AI system that removes the drudgery of job hunting: it parses the user's resume, learns their skills/profile, finds and ranks matching jobs, drafts answers to application questions, and fills out application forms in a real browser — stopping right before the final submit button so a human always makes the last call. Every filled application is logged to a tracker. The user plans to eventually make this public, not just for personal use, so auth and data security are first-class requirements from day one, and the job-matching logic should be genuinely well-reasoned (hybrid semantic + structured scoring), not a keyword hack.

Key decisions locked in through planning discussion:
- **Main app**: Next.js (App Router, TypeScript) on Vercel — owns UI, auth session handling, DB access, tracker, resume upload, profile.
- **Agent brains**: a separate Python service using **LangGraph** for multi-agent orchestration (resume parsing, matching, question drafting, form filling), exposed to Next.js over an internal API (FastAPI). Chosen because the user specifically wants LangGraph's orchestration power, while keeping Next.js as the primary app rather than a thin shell.
- **Auth**: Supabase Auth only (not Supabase's bundled Postgres).
- **Database**: Neon Postgres (separate from Supabase) — this split was a deliberate late change from an initial all-Supabase plan, so the data model and RLS approach below are designed specifically to bridge Auth-on-Supabase / DB-on-Neon safely.
- **File storage**: Supabase Storage (private buckets + signed URLs) — kept on Supabase since Storage is independent of which Postgres backs it, and it shares identity/JWT context with Auth.
- **Browser automation**: Browserbase (managed headless browser), driven by the form-filling agent via Playwright. **Never auto-submits** — always stops for human review/click.
- **LLM**: Anthropic Claude API for all agent reasoning.
- **Job sourcing**: hybrid — structured job-board APIs (Greenhouse, Lever, Ashby, Adzuna) plus user-pasted URLs/job text, normalized into one pipeline.
- **Custom application questions**: agent drafts answers by default (recommended, primary path); user can opt to answer any question themselves instead.

---

## 1. Data Model (Neon Postgres)

Neon Postgres is the system of record for all application data, including PII. Accessed from Next.js via **Drizzle ORM** (`@neondatabase/serverless` + `drizzle-orm/neon-http`/`neon-serverless`, TS-first schema-as-code, generates types). Accessed from the Python service via **SQLAlchemy (async) + asyncpg** (or asyncpg directly for simple paths). Supabase is used **only** for Auth — its `user.id` (UUID) is the identity every `user_id` column is keyed on, but it is **not** a live cross-database FK, since the actual tables live in Neon.

Schema is defined once, as code, in Drizzle (`packages/db/schema.ts`), migrated via `drizzle-kit` against Neon. The Python service consumes this same schema as a client — it does not own migrations, avoiding drift between two ORMs generating conflicting DDL.

### `users` (Neon-side mirror of Supabase Auth identity)
- `id uuid PK` — same UUID value as Supabase Auth's `auth.users.id`, kept in sync (not a real cross-provider FK).
- `email`, `created_at`
- Populated via a **Supabase Auth webhook** (on signup) → Next.js API route (`POST /api/internal/sync-user`) → insert into Neon. Every other table's `user_id` FKs to *this* local table. This sync is a hard dependency for FK integrity — must be verified working (signup → webhook → row in Neon) before any other feature work.

### `profiles`
- `id uuid PK references users(id)`
- `full_name`, `phone`, `location_city/state/country`
- `work_authorization` enum, `willing_to_relocate boolean`, `remote_preference` enum
- `links jsonb` (linkedin/github/portfolio/other)
- `eeo_gender`, `eeo_race`, `eeo_veteran_status`, `eeo_disability_status` — nullable, candidates for column-level encryption (see Security)
- `default_answer_mode` enum('agent_drafts','ask_me'), `onboarding_completed boolean`

### `resumes`
- `id`, `user_id`, `storage_path` (Supabase Storage private bucket, not public URL)
- `original_filename`, `file_type`, `file_size_bytes`, `is_active boolean`
- `parse_status` enum('pending','processing','complete','failed')

### `parsed_resume_data`
- `id`, `resume_id` FK, `user_id` (denormalized)
- `raw_text`, `skills jsonb` (name/category/years), `work_experience jsonb`, `education jsonb`, `certifications jsonb`, `projects jsonb`
- `total_years_experience numeric`, `seniority_level` enum
- `embedding vector(N)` (pgvector — Neon supports the extension natively; N depends on chosen embedding model, see Section 4)
- `parsed_by_model`, `parse_confidence numeric`

### `job_postings` (shared, not user-owned — no `user_id`)
- `id`, `source` enum('greenhouse','lever','ashby','adzuna','manual_paste','manual_url'), `source_id` (unique with `source` for dedupe)
- `company_name`, `title`, `description_raw`, `description_url`
- `location_text/city/state/country`, `is_remote boolean`, `employment_type` enum
- `seniority_level`, `salary_min/max/currency`
- `extracted_skills jsonb`, `embedding vector(N)`
- `posted_at`, `fetched_at`, `is_stale boolean`

### `matches`
- `id`, `user_id`, `job_posting_id`, `resume_id`
- `overall_score numeric`, `score_breakdown jsonb` (semantic_similarity, skill_overlap_pct, experience_fit, location_fit, recency)
- `match_rationale text`, `status` enum('suggested','shortlisted','dismissed','applied')
- unique `(user_id, job_posting_id)`

### `applications`
- `id`, `user_id`, `job_posting_id`, `match_id` (nullable)
- `company_name`, `role_title` (snapshot), `status` enum('draft','form_filled_pending_review','submitted_by_user','rejected','interviewing','offer','withdrawn')
- `application_url`, `resume_id`, `cover_letter_storage_path`
- `filled_at`, `user_submitted_at` (user self-reports after clicking submit), `notes text`

### `application_questions`
- `id`, `application_id` FK, `question_text`, `question_type` enum
- `answer_text`, `answered_by` enum('agent','user'), `agent_draft_answer text` (retained even if overridden — audit trail)
- `field_selector` (DOM identifier used by automation, for debugging), `order_index`

### `agent_runs` (audit log)
- `id`, `user_id`, `application_id` (nullable)
- `agent_type` enum('resume_parser','matcher','question_drafter','form_filler'), `status` enum('running','succeeded','failed','partial')
- `input_summary jsonb`, `output_summary jsonb` (avoid dumping raw PII — reference/hash where feasible)
- `browserbase_session_id` (nullable — enables replay for form-filler runs)
- `error_message`, `started_at`, `completed_at`, `duration_ms`

### `job_search_criteria`
- `id`, `user_id`, `keywords text[]`, `target_titles text[]`, `target_locations text[]`, `remote_only boolean`, `min_salary numeric`, `is_active boolean`

---

## 2. Authorization Design (Neon RLS + app-layer, since Auth and DB are split)

Supabase Auth and Neon DB being different providers means Postgres's usual `auth.uid()`-based RLS doesn't apply automatically. Two real options exist — full app-layer scoping only, or DB-level enforcement via **Neon RLS (Neon Authorize)**, which lets a third-party JWT issuer (Supabase Auth qualifies) drive Postgres RLS policies through the `pg_session_jwt` extension.

**Recommendation: both, layered.** Given this app stores PII and is headed toward public launch, relying solely on "every query remembers its WHERE clause" across two codebases (TS + Python) is a real long-term leak risk. So:
- Enable **Neon RLS** on every user-owned table, policies keyed off the Supabase-issued JWT (Drizzle has `crudPolicy` helpers for this).
- Next.js connects to Neon with the user's verified JWT attached per-request, so RLS applies to all Drizzle queries automatically — app-layer `WHERE user_id = ...` clauses stay in place too, as defense-in-depth and as the safety net for any table before its RLS policy is written.
- Python service uses **two distinct Neon roles**: (1) a JWT-passthrough role for user-owned table writes (Next.js forwards the user's verified JWT to Python per-request; RLS applies exactly as if the user made the call — Python never gets broader access than the acting user), and (2) a narrowly-scoped service role, restricted by its own RLS policy to the shared `job_postings` table only, for scheduled ingestion jobs with no single acting user. Neither role is a superuser or RLS-bypass credential.
- **Explicit tradeoff**: this adds setup complexity (extension config, per-connection JWT passthrough, policy authoring/testing) vs. app-layer-only. Acceptable to ship Phases 0-2 with rigorous app-layer scoping and layer in Neon RLS as part of Phase 5 hardening if timeline pressure demands it — but it should stay in the plan, not get dropped.

**File storage**: Supabase Storage (private buckets, short-lived signed URLs), not Vercel Blob — Storage is independent of which Postgres backs Supabase, so it can share identity/JWT context with Auth without pulling in a third vendor, and its per-user bucket policy model fits private PII documents (resumes) better than Blob's simpler, more public-by-default model.

---

## 3. System Architecture

```
                              ┌─────────────────────────┐
                              │        Browser            │
                              │  (User, public internet)  │
                              └────────────┬───────────────┘
                                           │ HTTPS
                                           ▼
                         ┌────────────────────────────────────┐
                         │     Next.js App (Vercel)             │
                         │  - App Router UI                      │
                         │  - API routes / BFF layer             │
                         │  - Supabase Auth (SSR cookies, JWT)   │
                         │  - Drizzle ORM → Neon (RLS via JWT)   │
                         │  - zod validation on every route      │
                         │  - Rate limiting (Upstash)             │
                         └───┬────────────┬───────────────┬──────┘
                             │            │               │
                  (auth verify/session) (Neon conn,  (internal API call,
                             │           user JWT)     bearer token)
                             ▼            ▼               ▼
                   ┌──────────────┐ ┌───────────┐ ┌─────────────────────────┐
                   │  Supabase     │ │  Neon      │ │  Python Agent Service   │
                   │  - Auth only  │ │  Postgres  │ │  (Railway or Fly.io)    │
                   │  - Storage    │ │  - Neon RLS│ │  - FastAPI               │
                   │  (private     │ │  - pgvector│ │  - LangGraph agents      │
                   │  buckets)     │ └─────┬──────┘ │  - Verifies Supabase JWT │
                   └──────────────┘        ▲        │    locally (JWKS)        │
                                            │        │  - Talks to Anthropic    │
                              (direct pooled│conn,   │  - Talks to Browserbase  │
                               user JWT or  │scoped  └─────┬──────────┬─────────┘
                               service role,│ SSL)          │          │
                                            └───────────────┘          │
                                                        ┌───────────────┐   ┌──────────────────┐
                                                        │ Anthropic API │   │  Browserbase     │
                                                        │ (Claude)      │   │  (Playwright      │
                                                        └───────────────┘   │   sessions)       │
                                                                             └──────────────────┘
  External job sources (called by Python service, server-side):
  Greenhouse Job Board API · Lever Postings API · Ashby Job Board API · Adzuna API
```

### Trust boundaries
- **Browser (untrusted)**: talks only to Next.js. Never touches Neon, the Python service, Browserbase, or Anthropic directly.
- **Next.js (Vercel)**: authenticates via Supabase Auth (SSR cookie session via `@supabase/ssr`), then does all data access against **Neon** (not Supabase) via Drizzle with the user's verified JWT attached so RLS applies. Calls Supabase only for Auth and Storage signed-URL generation. Calls the Python service over an internal bearer-token channel.
- **Python service**: verifies the Supabase JWT it receives from Next.js via Supabase's public JWKS (signature check only, no network call to Supabase's data layer), then connects **directly to Neon** using one of the two roles described above. Holds Anthropic and Browserbase keys; never holds a Supabase service key.
- **Supabase**: narrow boundary now — Auth (identity/sessions/JWT issuance) and Storage. No PII lives in Supabase's own Postgres; it isn't used as a database in this design.
- **Neon**: system of record for all PII. RLS is the last line of defense here.
- **Browserbase / Anthropic / job-board APIs**: external, called only server-side from the Python service; keys never reach the client or a public env var.

---

## 4. Agent Design (LangGraph)

Four agents, matching the four responsibilities of the Python service — no extras invented.

### 4.1 Resume Parser Agent
Trigger: resume upload → Next.js stores file in Supabase Storage → calls Python `/agents/parse-resume` with a short-lived signed download URL. Extracts raw text (`pypdf`/`pdfplumber` for PDF, `python-docx` for DOCX) → one Claude call with a structured-output schema for skills/experience/education/seniority → computes an embedding of a normalized resume summary. Writes `parsed_resume_data`, updates `resumes.parse_status`, logs `agent_runs`. Terminal for this flow; its output feeds the Matcher.

### 4.2 Matcher/Ranker Agent
Trigger: scheduled/on-demand search, a manually pasted job, or newly ingested postings. Pipeline: structured pre-filter (location/seniority/employment type) → pgvector cosine similarity retrieval (top ~50-100 candidates) → structured re-ranking (Section 5 formula) → Claude-generated rationale for the top-N. Writes/upserts `matches`. No automatic handoff — user reviews and shortlists in the UI.

### 4.3 Question-Answer Drafter Agent
Trigger: application has custom questions (discovered during a form pre-check, or pasted in manually pre-Phase-4). Input: question text/type + context bundle (parsed resume, profile, job description) + the user's `default_answer_mode`, overridable per question. For `agent_drafts` questions: one Claude call per question (or batched), grounded and respecting any detected length/format constraints. For `ask_me` questions: agent does not answer, surfaces the question back to the user. Writes `application_questions.agent_draft_answer`/`answer_text`/`answered_by`. Recommend running this standalone-first (user reviews/edits answers in a normal web form before any browser automation starts), with inline fallback only for questions the form-filler discovers dynamically.

### 4.4 Form-Filler / Orchestrator Agent
Trigger: user clicks "Fill this application." Opens a Browserbase session via Playwright → navigates to `apply_url` → form-discovery pass (DOM inspection, Claude call when structure is ambiguous, routing any unanticipated questions back through 4.3) → fills standard fields from `profiles`, uploads resume, fills question answers → **stops before the submit button**, takes a final screenshot, sets `applications.status = 'form_filled_pending_review'` → surfaces the result in the Next.js UI for the user to review and manually submit. Terminal agent; user action (or a "confirm I submitted" click) moves status to `submitted_by_user` with `user_submitted_at`.

### Graph shape
Mostly linear, with human-in-the-loop breaks between stages rather than automatic LangGraph edges across them — each stage is invoked as a fresh, independently debuggable graph run triggered by a user action in Next.js:
```
[resume_parser] → [matcher] → (user shortlists) → [question_drafter] → (user reviews/edits) → [form_filler] → (human submits)
```

---

## 5. Matching Algorithm (hybrid semantic + structured re-ranking)

Mirrors a standard two-stage retrieve-then-rerank architecture (as in hybrid vector-search/recommendation systems): coarse filtering → dense retrieval → weighted structured re-ranking → LLM explanation. Pure keyword matching misses paraphrase ("ML engineer" vs "machine learning engineer"); pure embedding similarity alone is bad at hard constraints (years of experience, location) — hence the layered approach.

1. **Structured pre-filter**: employment type, hard/soft location constraints (soft-penalize by default rather than hard-filter, so hybrid roles aren't missed), work-authorization flags.
2. **Structured skill extraction** (done at ingestion, both resume and job side, via the same Claude structured-extraction pass, normalized to a canonical skill vocabulary): `skill_overlap_pct = |resume_skills ∩ job_required_skills| / |job_required_skills|`, weighting required over nice-to-have skills.
3. **Semantic embedding similarity (retrieval)**: embed a normalized resume summary and the job description using a dedicated embeddings model — **Voyage AI (`voyage-3`/`voyage-3-lite`)**, Anthropic's recommended embeddings partner, or OpenAI `text-embedding-3-small` as fallback (Claude itself has no embeddings endpoint). Store in pgvector, HNSW/IVFFlat index on `job_postings.embedding`, cosine similarity for fast top-K retrieval (~50-100 candidates) across the shared job pool.
4. **Structured re-ranking (final score)**, each factor stored separately in `matches.score_breakdown` so the UI can explain *why* a job scored well:
   ```
   overall_score =
       0.40 * semantic_similarity
     + 0.30 * skill_overlap_pct
     + 0.15 * experience_level_fit
     + 0.10 * location_fit
     + 0.05 * recency/freshness
   ```
5. **LLM rationale**: for the final top-N surfaced to the user, one Claude call generates a short human-readable explanation. Explanation only — doesn't affect ranking, keeping ranking deterministic and debuggable.

**Cold start**: a brand-new posting (e.g. manual paste) is embedded synchronously at ingestion, before it's eligible for matching — the matcher never needs a text-search fallback.

---

## 6. Job Sourcing Integration Plan

**Structured APIs**, build in this order:
1. **Greenhouse Job Board API** — public, no auth (`boards-api.greenhouse.io/v1/boards/{company}/jobs`). Start with a curated/seed company list.
2. **Lever Postings API** — public, no auth (`api.lever.co/v0/postings/{company}?mode=json`). Same seed-list approach.
3. **Ashby Job Board API** — public but less standardized; third priority.
4. **Adzuna API** — aggregator, requires a free API key; broader coverage beyond ATS-powered boards. Add once the ATS-specific pipeline is proven, since it needs its own normalization (thinner JDs, different schema).

All four normalize into `job_postings` via a shared ingestion interface (`ingestion/greenhouse.py`, `ingestion/lever.py`, ... each implementing `fetch_postings() -> list[NormalizedJobPosting]`), so new sources plug in without touching the matcher.

**Manual URL/paste-in**: user pastes a URL or raw JD text. If URL, fetch server-side (never client-side — avoids CORS and IP leakage), strip HTML via `trafilatura`/`readability`; for JS-rendered pages that yield too little text from a static fetch, optionally fall back to a Browserbase/Playwright fetch. Either path writes into `job_postings` (`source = 'manual_url'`/`'manual_paste'`) and runs through the *same* skill-extraction + embedding pipeline as API-sourced postings — manual ingestion is just an alternate entry point, not a separate downstream path. This is what lets Phase 2 ship value before job-board integrations and browser automation exist.

**Dedup**: unique `(source, source_id)` for API-sourced jobs; for manual entries with no natural key, consider a content hash of `description_raw` to detect and reuse duplicate pastes.

---

## 7. Security Plan

| Concern | Concrete measure |
|---|---|
| Row ownership / RLS | **Neon RLS (Neon Authorize)** on all user-owned tables, policies keyed off the Supabase-issued JWT, layered on top of mandatory app-layer `WHERE user_id = ...` scoping in both Next.js/Drizzle and the Python service — defense-in-depth, not either/or (see Section 2) |
| Resume/file storage | Private Supabase Storage buckets (`resumes`, `cover-letters`), never public; access only via short-lived signed URLs (5-10 min) generated server-side after verifying ownership |
| Secrets — Vercel | Anthropic key, Browserbase key, job-board API keys, Neon pooled connection string(s), Supabase Auth keys: all server-only encrypted env vars, never `NEXT_PUBLIC_*`; scope preview vs. production separately |
| Secrets — Python service host | Anthropic/Browserbase keys, **two distinct Neon connection strings** (JWT-passthrough role and scoped service role — not one broad credential), Supabase JWKS endpoint URL for local JWT verification; all in the host's (Railway/Fly.io) encrypted env store |
| API boundary validation | `zod` on every Next.js API route; `pydantic` on every FastAPI endpoint — reject malformed/oversized payloads before business logic runs |
| Rate limiting | `@upstash/ratelimit` + Upstash Redis on Next.js, keyed by user_id/IP, especially on resume upload, job search, and form-fill trigger endpoints; `slowapi` (or equivalent) on the Python service as defense-in-depth |
| CSRF | `@supabase/ssr` cookie sessions (`sameSite: lax/strict`); verify `Origin`/`Referer` on sensitive POST routes as an added check |
| Session/cookie handling | `@supabase/ssr` (current recommended package) for correct secure/httpOnly cookie refresh in server components/middleware |
| PII encryption at rest | Neon encrypts at rest by default at the infrastructure level; for extra-sensitive fields (EEO responses) consider application-level column encryption using a KMS-backed key rather than plaintext columns. **Do not collect SSN** — out of scope, most applications don't require it upfront |
| Least privilege — Python↔DB | Two distinct Neon roles as described in Section 2 — JWT-passthrough (user-scoped, RLS-enforced) and a narrowly-scoped service role limited to `job_postings` — never a superuser/RLS-bypass credential |
| Audit logging | `agent_runs` captures every agent action (input/output summaries, `browserbase_session_id` for replay); `application_questions.answered_by` + retained `agent_draft_answer` gives a clear agent-vs-human attribution trail |
| Dependency/secret scanning in CI | `npm`/`pnpm audit` + Dependabot (Next.js), `pip-audit` (Python), `gitleaks` or GitHub native secret scanning on every PR |
| Third-party credentials boundary | **Explicit decision: do not store user credentials for job sites.** Prefer postings that are guest-fillable (most ATS forms are). If a site requires login, either skip automation and flag "manual apply required" in the UI, or (future phase) let the user authenticate live inside a Browserbase session that the agent then continues within — without EasyApply.ai ever seeing/storing the password. Documented as an explicit risk boundary, not solved in MVP |
| Browserbase session data | Treat recordings/screenshots as containing PII (filled forms); apply the same private-storage + signed-URL pattern if persisted, with a defined retention/expiry policy |

---

## 8. Phased Build Order

**Phase 0 — Scaffolding, Auth, DB**
Next.js scaffold (TS, App Router), Supabase project for Auth, **Neon project provisioned** (Drizzle migrations, pgvector enabled, Neon RLS/Authorize configured with Supabase as trusted JWT issuer), and the **Supabase-Auth-to-Neon `users` sync webhook built and verified end-to-end** (this is a hard dependency for every other table's FK integrity — confirm before Phase 1). Python service skeleton (FastAPI) deployed to Railway, health check + bearer-token auth from Next.js confirmed. CI skeleton (lint/typecheck/tests + secret scanning).

**Phase 1 — Resume Upload + Parsing**
Supabase Storage bucket + signed upload flow, `resumes` table, upload UI. Resume Parser Agent wired end-to-end; UI lets the user review/correct extracted data (parsing errors compound downstream, so this matters). Profile form (`profiles` table).

**Phase 2 — Manual Job Paste-In + Question Answering + Tracker (no automation yet)**
Manual URL/paste-in ingestion. Question-Answer Drafter Agent for user-entered application questions. `applications`/`application_questions` tracker UI. Ships a fully usable "help me draft answers and stay organized" product before matching or automation exist — earliest point of real user value, zero automation risk.

**Phase 3 — Job-Board API Sourcing + Matching/Ranking**
Greenhouse + Lever ingestion (scheduled fetch), normalization into `job_postings`. Embedding pipeline (Voyage AI or OpenAI) + pgvector indexes. Matcher/Ranker Agent (Section 5 pipeline); ranked-matches UI with score breakdown and shortlisting. Add Ashby + Adzuna once the pipeline is proven.

**Phase 4 — Browserbase Form-Filling Automation**
Form-Filler/Orchestrator Agent: Playwright-over-Browserbase, form discovery, field-filling, stop-before-submit checkpoint, screenshot/session surfaced for review. Start with Greenhouse/Lever's own application forms (more consistent DOM) before generalizing. Wire in the Question-Answer Drafter's output as the answer source.

**Phase 5 — Hardening / Security Pass**
Full Neon RLS policy audit/testing, rate limiting rollout, CSRF/header checks, CI scanning gates, PII column-level encryption for EEO fields, Browserbase session data retention policy, load-test the matching pipeline, error tracking/observability (e.g. Sentry) across both services, incident-response runbook for a credential/data-exposure scenario.

---

## 9. Python Service Hosting

**Recommendation: Railway** (Fly.io as alternative) — Vercel's serverless/edge functions are a poor fit for a long-lived LangGraph orchestration process and multi-minute Playwright/Browserbase sessions. Railway offers the simplest DX for a FastAPI + LangGraph Docker app, easy secret management, and straightforward scaling — good default for getting to production fast. Fly.io is the better pick if geographic proximity to Browserbase's infra, more networking control, or persistent-VM behavior for long-lived WebSocket connections becomes important later. Render is a fine fallback with similar tradeoffs to Railway.

**Communication**:
- Next.js → Python: server-side `fetch` (never from client components) over a shared bearer secret; prefer the host's private networking (Railway private networking / Fly.io 6PN) over the public internet where available.
- Python → Neon: direct pooled connection (`asyncpg`/SQLAlchemy through Neon's PgBouncer-based pooled endpoint — more appropriate for a long-lived service than the edge-oriented serverless driver), `sslmode=require`, using the JWT-passthrough or scoped service role per Section 2.
- Python → Supabase: **JWT verification only** — fetch/cache Supabase's JWKS and verify signatures locally; no other Supabase data access from Python.
- Python → Anthropic/Browserbase: standard HTTPS, keys from the host's secret manager, never logged, rotated periodically.

---

## Verification

Since this is a from-scratch build, "testing" means confirming each phase's slice actually works end-to-end before moving on:
- **Phase 0**: sign up a test user in the deployed app → confirm a matching row appears in Neon's `users` table (validates the sync webhook) → confirm Next.js can query Neon through Drizzle with RLS enforced (a second test user must not see the first user's rows) → confirm Next.js can reach the Python service's health endpoint with the bearer token.
- **Phase 1**: upload a real resume PDF/DOCX through the UI → confirm `parsed_resume_data` is populated with sensible skills/experience → confirm a malformed/huge file is rejected cleanly.
- **Phase 2**: paste a real job posting URL and raw JD text → confirm both land in `job_postings` with extracted skills → draft answers for a few sample application questions and check they're grounded in the resume/profile, not generic → create/update a tracked application through its statuses.
- **Phase 3**: run the matcher against a small seeded set of Greenhouse/Lever postings → confirm the ranked list and score breakdown look sane relative to the test resume, and that a shortlist action persists.
- **Phase 4**: run the form-filler against a real (test) Greenhouse or Lever application form in a Browserbase session → confirm it stops before submit, the screenshot/session is visible in the UI, and clicking "I submitted" updates the tracker.
- **Phase 5**: attempt cross-user data access (should be blocked by RLS), run the dependency/secret scanners in CI and confirm they gate merges, verify rate limits trigger under load on the upload/search/fill endpoints.
