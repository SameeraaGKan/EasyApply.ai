# EasyApply.ai

A multi-agent, agentic-AI system that parses your resume, matches you to jobs, drafts answers to application questions, and fills out application forms in a real browser — stopping before final submit so you always click it yourself.

See [`docs/plan.md`](docs/plan.md) for the full architecture and phased build plan (data model, agent design, matching algorithm, security plan, hosting).

## Repo layout

```
web/             Next.js app (TypeScript, App Router) — UI, auth, DB access, tracker. Deployed to Vercel.
agent-service/   Python FastAPI + LangGraph service — the agent brains (resume parsing, matching, question drafting, form filling). Deployed to Railway.
```

## Architecture at a glance

- **Auth**: Supabase Auth only.
- **Database**: Neon Postgres (all application data, including PII).
- **File storage**: Supabase Storage (private buckets, signed URLs).
- **Browser automation**: Browserbase, driven by the Python service. Never auto-submits.
- **LLM**: Anthropic Claude API.

Since Auth (Supabase) and the database (Neon) are different providers, row-level security is enforced via **Neon RLS (Neon Authorize)**, keyed off the Supabase-issued JWT, layered on top of app-level authorization checks. See plan Section 2 for details.

## Prerequisites — accounts to create

You'll need accounts/projects on:

1. **Supabase** (supabase.com) — create a project. Used for Auth only.
2. **Neon** (neon.tech) — create a project. This is the actual database.
3. **Railway** (railway.app) or Fly.io — hosts the Python agent service.
4. **Anthropic** (console.anthropic.com) — API key for Claude. Used from Phase 1 (resume parsing).
5. **Voyage AI** (dash.voyageai.com) — API key for embeddings. Used from Phase 1 (resume parsing).
6. **Browserbase** (browserbase.com) — API key for the form-filler agent (Phase 4). Optional for local dev (falls back to local Chromium — see Phase 4 setup below), required in production.
7. **Upstash** (upstash.com) — Redis for rate limiting (optional for local dev, needed before public launch).
8. **Vercel** (vercel.com) — hosts `web/`.

## Local setup

### 1. Neon database

- Create a Neon project, enable the `pgvector` extension, and grab the **pooled** connection string.
- Copy `web/.env.example` to `web/.env.local` and set `DATABASE_URL`.
- Run migrations:
  ```
  cd web
  npm install
  npm run db:migrate
  ```
- **Neon RLS setup** (do this before storing real user data — see plan Section 2): in the Neon console, enable Neon Authorize and register your Supabase project as a trusted JWT issuer using Supabase's JWKS URL (`https://<project-ref>.supabase.co/auth/v1/.well-known/jwks.json`). Until this is configured, the app still enforces row ownership at the application layer (every query is scoped by `user_id`), but the database-level safety net isn't active yet.

### 2. Supabase Auth

- Create a Supabase project. Copy the Project URL and anon key into `web/.env.local` (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`).
- **Wire the users sync webhook** (hard dependency — every table FKs to the local `users` table this populates):
  1. Generate a random secret and set it as `SUPABASE_WEBHOOK_SECRET` in `web/.env.local`.
  2. In the Supabase dashboard: Database → Webhooks → new webhook on the `auth.users` table, event `INSERT`, HTTP method `POST`, URL pointing at your deployed (or tunneled, for local dev) `/api/internal/sync-user` endpoint, with an HTTP header `x-webhook-secret` set to the same secret.
  3. Sign up a test user and confirm a matching row appears in Neon's `users` table.

### 3. Web app

```
cd web
npm install
npm run dev
```

Visit `http://localhost:3000` — you'll be redirected to `/login` to sign up/sign in.

### 4. Agent service

```
cd agent-service
python -m venv .venv
./.venv/Scripts/activate   # or source .venv/bin/activate on macOS/Linux
pip install -r requirements.txt
python -m playwright install chromium   # needed for the form-filler agent, see Phase 4 below
cp .env.example .env       # fill in the vars below
uvicorn app.main:app --reload
```

Env vars (`agent-service/.env`):
- `AGENT_SERVICE_BEARER_TOKEN` — must match `web/.env.local`'s value of the same name.
- `SUPABASE_PROJECT_URL` — same Supabase project as `web/.env.local`.
- `ANTHROPIC_API_KEY` — from console.anthropic.com. Powers resume structured extraction (Claude tool use).
- `VOYAGE_API_KEY` — from dash.voyageai.com. Powers the `voyage-3-lite` embeddings used for matching.
- `DATABASE_URL` — same Neon pooled connection string as `web/.env.local`.
- `BROWSERBASE_API_KEY` / `BROWSERBASE_PROJECT_ID` — optional for local dev (see Phase 4 below); required in production.

> Note: `asyncpg` doesn't yet ship prebuilt wheels for brand-new Python releases and can fail to build from source on some platforms. Use Python 3.12 for this venv (matches the Docker deployment target) if you hit a build error — `py -3.12 -m venv .venv` on Windows, or the equivalent `python3.12` on macOS/Linux.

Verify: `curl http://localhost:8000/health` should return `{"status": "ok"}`, and `curl -H "Authorization: Bearer <token>" http://localhost:8000/health/authenticated` should also return `{"status": "ok"}` (401 without the header, or with the wrong token).

### 5. End-to-end resume flow

With both `web` and `agent-service` running and all env vars filled in: sign up, fill out `/profile`, then upload a resume at `/resume`. The page uploads the file straight to Supabase Storage, records a `resumes` row, and calls the agent service to extract text, run Claude structured extraction, embed a summary via Voyage, and write `parsed_resume_data`. You'll land on `/resume/[id]` where the extracted skills/experience/education are editable before being used for matching in a later phase.

### 6. Application tracker + question drafting (no automation yet)

At `/applications`, click "Track a new application" and fill in the company/role, optionally pasting a job posting URL or the raw description — the agent service fetches and normalizes it into `job_postings` (manual paste-in skips skill extraction/embedding since nothing consumed them until Phase 3 — see below; job-board-sourced postings get the full pipeline). On the application's detail page, add any custom questions from the real application form; each defaults to "agent drafts" (per your profile's default answer mode, overridable per question). Click "Draft pending answers" to have the Question-Answer Drafter agent write grounded answers from your resume + the linked job description — review/edit them inline, or switch a question to "I'll answer it" to type your own. Update the status dropdown as the application moves through your pipeline (there's no browser automation yet — you still submit manually and mark it done).

### 7. Job-board sourcing + matching

At `/matches`, enter a company's Greenhouse or Lever board token (the slug in their careers URL, e.g. `stripe` for `boards.greenhouse.io/stripe`) to pull in its open postings — each one gets skill-extracted (Claude) and embedded (Voyage) the same way a parsed resume does. Click "Find matches" to run the Matcher/Ranker agent: it retrieves the top candidates by embedding similarity against your active resume, re-ranks them with a weighted structured score (skill overlap, experience-level fit, location fit, recency — see plan Section 5), and writes an LLM-generated rationale for the top results. Shortlist or dismiss anything in the ranked list; dismissed postings drop out of the view.

Only Greenhouse and Lever are wired up (per plan Section 6's phased rollout — Ashby/Adzuna are a later addition). Greenhouse was verified against live company boards during development; Lever's response parsing is built defensively against its documented schema but wasn't verified against a live board with open postings, so spot-check it against a real company token before relying on it.

### 8. Browser automation (form filling)

On an application's detail page, click "Fill application" to run the Form-Filler agent: it opens the real application page in a browser, fills it from your profile, active resume, and any answered questions, and **stops before the submit button** — you always review the screenshot and click submit yourself on the real site, then mark the application "Submitted" in the status dropdown. A field-by-field report shows what filled successfully, what didn't stick, and any questions found on the page that don't have a matching answer yet (add them above and re-run).

Only Greenhouse-hosted applications (`job-boards.greenhouse.io` / `boards.greenhouse.io`) are supported right now — this was verified against a real live application page during development (every field, including the react-select dropdowns and resume upload, confirmed working end to end). Anything else returns a clear "not supported yet" message rather than guessing at an unfamiliar form. Lever's application-form filler is a natural next addition once the job-board matching side (Section 7) has real Lever data to work from.

**Browserbase is optional for local dev** — without `BROWSERBASE_API_KEY`/`BROWSERBASE_PROJECT_ID` set, the agent falls back to a locally-launched headless Chromium (that's what `playwright install chromium` in step 4 is for). The Browserbase code path itself is built against their documented REST API but wasn't exercised against a live account (none was available during development) — verify it against a real session before depending on it in production. **In production, Browserbase is required**: the deployed Docker image doesn't bundle a browser binary, so the local-Chromium fallback isn't available there.

## Deployment

- **`web/`** → Vercel. Set the same env vars from `web/.env.example` in the Vercel project settings (production + preview scoped separately).
- **`agent-service/`** → Railway (or Fly.io), using the included `Dockerfile`. Set `AGENT_SERVICE_BEARER_TOKEN`, `SUPABASE_PROJECT_URL`, and — since the deployed image has no local browser binary — `BROWSERBASE_API_KEY`/`BROWSERBASE_PROJECT_ID` (required in production, unlike local dev). Point `web`'s `AGENT_SERVICE_URL` at the deployed service.

## CI

`.github/workflows/ci.yml` runs lint/typecheck/build + `npm audit` for `web/`, an import check + `pip-audit` for `agent-service/`, and a secret scan (gitleaks) on every push/PR.
