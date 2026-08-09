# Getting EasyApply.ai running locally

Checklist to go from cloned repo to a working local dev environment. See [`README.md`](README.md) for the full reference and [`docs/plan.md`](docs/plan.md) for the architecture behind each piece.

## 1. Create accounts

- [ ] [Neon](https://neon.tech) — new project, enable the `pgvector` extension, copy the **pooled** connection string
- [ ] [Supabase](https://supabase.com) — new project, copy the Project URL + anon key (Settings → API)
- [ ] [Anthropic](https://console.anthropic.com) — API key
- [ ] [Voyage AI](https://dash.voyageai.com) — API key

## 2. Configure `web/`

- [ ] `cd web && cp .env.example .env.local`
- [ ] Fill in `DATABASE_URL` (Neon pooled string)
- [ ] Fill in `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` (Supabase)
- [ ] Make up two random secrets for `SUPABASE_WEBHOOK_SECRET` and `AGENT_SERVICE_BEARER_TOKEN` (any long random string — just needs to match agent-service's copy later)
- [ ] Leave `AGENT_SERVICE_URL` as `http://localhost:8000` for now
- [ ] `npm install`
- [ ] `npm run db:migrate`

## 3. Wire the Supabase → Neon sync webhook

This is the one non-obvious step. Every table in the app foreign-keys to a `users` row that only gets created when this webhook fires on signup, so nothing works without it. The catch: Supabase needs a **public URL** to call, and `localhost:3000` isn't reachable from Supabase's servers.

- [ ] Run a tunnel: `npx cloudflared tunnel --url http://localhost:3000` (or `ngrok http 3000`)
- [ ] In the Supabase dashboard: **Database → Webhooks** → new webhook
  - Table: `auth.users`
  - Event: `INSERT`
  - URL: `<tunnel-url>/api/internal/sync-user`
  - Header: `x-webhook-secret` = same value as `SUPABASE_WEBHOOK_SECRET` in `.env.local`

## 4. Configure `agent-service/`

- [ ] `cd agent-service`
- [ ] `py -3.12 -m venv .venv` — **use 3.12 specifically** (see README note on `asyncpg` wheel availability for newer Python versions)
- [ ] `./.venv/Scripts/activate` (or `source .venv/bin/activate` on macOS/Linux)
- [ ] `pip install -r requirements.txt`
- [ ] `cp .env.example .env`
- [ ] Fill in `AGENT_SERVICE_BEARER_TOKEN` (same value as `web/.env.local`)
- [ ] Fill in `SUPABASE_PROJECT_URL`, `ANTHROPIC_API_KEY`, `VOYAGE_API_KEY`
- [ ] Fill in `DATABASE_URL` (same Neon string as `web/.env.local`)

## 5. Run both

- [ ] Terminal 1: `cd agent-service && uvicorn app.main:app --reload`
- [ ] Terminal 2: `cd web && npm run dev`

## 6. Verify end-to-end

- [ ] Sign up at `localhost:3000`
- [ ] Confirm a matching row shows up in Neon's `users` table
- [ ] Fill out `/profile`
- [ ] Upload a resume at `/resume` and watch it get parsed
- [ ] Try `/applications` — track one, add a question, draft an answer

## Can skip for now

Not needed until deployment or later phases:

- [ ] Railway or Fly.io (Python service hosting — deployment only)
- [ ] Browserbase (Phase 4 — browser automation)
- [ ] Upstash (rate limiting — optional for local dev, needed before public launch)
- [ ] Vercel (deployment only)

## Worth doing once things work

- [ ] Enable **Neon RLS / Neon Authorize** (steps in README) — the app runs fine without it since row ownership is enforced in code too, but it's the database-level safety net for handling real user PII.
