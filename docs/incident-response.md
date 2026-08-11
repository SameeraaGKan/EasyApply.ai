# Incident response runbook

Concrete steps for the credential-exposure and data-security incidents this app is actually exposed to, given its architecture (Next.js on Vercel, Python agent service on Railway/Fly.io, Neon Postgres, Supabase Auth/Storage, Anthropic, Voyage AI, Browserbase). Written for a single maintainer/small team — no assumption of a dedicated security desk.

General principle for every scenario below: **contain first (rotate/revoke), then investigate, then fix root cause, then write down what happened.** Don't spend time diagnosing root cause while a leaked credential is still live.

## 1. Leaked credential or secret

Applies to: `AGENT_SERVICE_BEARER_TOKEN`, `SUPABASE_WEBHOOK_SECRET`, `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (lower severity — anon key is meant to be public, but rotate if paired with an RLS misconfiguration), `ANTHROPIC_API_KEY`, `VOYAGE_API_KEY`, `BROWSERBASE_API_KEY`, `PROFILE_ENCRYPTION_KEY`, `SENTRY_DSN` (low severity, DSNs are semi-public by design).

**How this could happen here specifically**: committed to git by accident (the CI secret scan — gitleaks — is the backstop, but don't rely on it alone), pasted into an AI chat/support ticket, logged in plaintext by a misconfigured error tracker (this is exactly why `send_default_pii`/`include_local_variables` are off in the Sentry config — see `web/src/instrumentation.ts` and `agent-service/app/main.py`), or exposed via a compromised contributor's machine.

**Contain (do this first, in order):**

1. **Rotate the credential at its source immediately**:
   - `ANTHROPIC_API_KEY` — console.anthropic.com → API keys → revoke, issue new.
   - `VOYAGE_API_KEY` — dash.voyageai.com → API keys → revoke, issue new.
   - `BROWSERBASE_API_KEY` — browserbase.com dashboard → revoke, issue new.
   - `DATABASE_URL` — Neon console → reset the role's password (this invalidates the old connection string immediately).
   - `SUPABASE_WEBHOOK_SECRET` / `AGENT_SERVICE_BEARER_TOKEN` — these are values *you* generate; create a new random value, don't "revoke" anything upstream.
   - `PROFILE_ENCRYPTION_KEY` — see the dedicated note below; this one is not a simple swap.
2. **Update the new value everywhere it's configured**: Vercel project env vars (`web`), Railway/Fly.io env vars (`agent-service`), and your local `.env.local`/`.env` if you're still using the old one locally.
3. **Redeploy both services** so the new values actually take effect (env var changes alone don't restart a running instance on most platforms).
4. **Confirm the old credential no longer works** — for API keys, a quick call that should now 401 confirms rotation succeeded.

**`PROFILE_ENCRYPTION_KEY` is a special case**: rotating it makes every already-encrypted `profiles.eeo_*` value undecryptable, since the new key can't open ciphertext written under the old one. If this key leaks:
1. Rotate it anyway — a leaked key is worse than a data-availability problem.
2. Before rotating, if you can, decrypt all existing `eeo_*` values with the old key and re-encrypt with the new one in the same migration (a one-off script using `web/src/lib/encryption.ts`'s `decryptField`/`encryptField` against the old and new keys). If that's not feasible in the moment, rotate first and accept that existing users will see empty EEO fields until they re-enter them — this is voluntary data, so the impact is low.

**Investigate**: check Anthropic/Voyage/Browserbase usage dashboards for the period the credential was exposed for anomalous request volume (a leaked API key's most common abuse is someone else running up your bill, not data theft — these APIs don't expose your users' data through the key itself). Check Neon's connection logs for unfamiliar client IPs if `DATABASE_URL` leaked. Check gitleaks' scan history and `git log -p` around the suspected exposure point if it was committed.

**Follow-up**: if it was committed to git, the credential is in history forever even after a fix-forward commit — rotation (not history rewriting) is the actual fix. Add the leaked value's *pattern* to gitleaks' config if it's a custom format gitleaks' default rules wouldn't catch.

## 2. Cross-user data exposure / RLS bypass

**How this could happen here specifically**: a query in `web/` or `agent-service/` that forgets its `WHERE user_id = ...` clause (the app-layer scoping every DAL/db.py function is supposed to have — see plan Section 2), a Neon RLS policy from `docs/neon-rls-setup.sql` that's missing, misconfigured, or was never applied, or a signed Storage URL (resumes, screenshots) that leaks/gets shared beyond its intended 5-10 minute window.

**Contain:**
1. If it's an active, ongoing leak (e.g., a bad deploy), roll back the deploy immediately (`vercel rollback` / redeploy the previous Railway/Fly.io image) rather than trying to hotfix forward under pressure.
2. If Neon RLS is confirmed misconfigured, that's a defense-in-depth layer failing, not the primary one — check whether the app-layer `WHERE user_id` scoping still held. If both failed, this is more serious: treat it as a real breach (see below).

**Investigate:**
1. Reproduce with two real test accounts (this is exactly the check the plan's Phase 0/5 verification sections call for — do it now if you haven't already validated it post-launch).
2. Check `agent_runs` (the audit log — plan Section 7) for the affected time window; it records `user_id` + `input_summary`/`output_summary` for every agent action, which can help scope what data specific agent runs touched.
3. Grep recent commits touching `dbForUser`/`db.py` query functions for the missing scoping clause.

**Remediate**: fix the specific query, add/fix the corresponding Neon RLS policy, and — if user data was actually exposed to another user (not just theoretically exposable) — notify the affected users of what was visible and for how long. Err toward disclosure; silence is the wrong default for PII (resumes, EEO data, application answers) even at small scale.

## 3. Agent cost runaway / abuse

**How this could happen here specifically**: rate limiting misconfigured or Upstash not provisioned (`checkRateLimit` no-ops without `UPSTASH_REDIS_REST_URL`/`TOKEN` — see `web/src/lib/rate-limit.ts`), a scraped/leaked `AGENT_SERVICE_BEARER_TOKEN` letting someone call the agent service directly, or a legitimate bug causing an agent to loop (e.g., the job-board ingestion's per-posting concurrency, or a retry loop that isn't actually capped).

**Contain**:
1. Check Anthropic/Voyage/Browserbase billing dashboards for the current period — this is usually how you'll *notice* this scenario, not from an alert.
2. If confirmed abuse (not a legitimate spike), rotate `AGENT_SERVICE_BEARER_TOKEN` immediately (see Section 1) — this cuts off any caller that isn't the real `web` deployment.
3. Set hard spend limits/budget alerts at the provider level (Anthropic console, Voyage dashboard) — do this proactively, not just after the first incident.

**Investigate**: `agent_runs` again — `status`, `duration_ms`, and `input_summary`/`output_summary` per row make it possible to spot a specific run or user driving disproportionate volume. Check Upstash's dashboard (if configured) to confirm rate limits were actually being enforced during the window.

## 4. Compromised dependency (supply chain)

Dependabot (`.github/dependabot.yml`) and CI's `npm audit`/`pip-audit` gates (`.github/workflows/ci.yml`) are the primary defenses here — this section is what to do when one of them (or an external advisory) flags something serious, e.g. a maintainer-account compromise in a package this project depends on.

1. Check whether the compromised version is actually in the current lockfile (`web/package-lock.json`, `agent-service/requirements.txt` pins) — a Dependabot alert on a *possible* range doesn't mean the exact installed version is affected.
2. If it is: pin to a known-good version immediately (don't wait for the automatic Dependabot PR), redeploy both services.
3. If the compromised package had any plausible code-execution path in a production code path (not just a dev dependency), rotate every secret both services hold (Section 1) out of caution — a compromised dependency with execution access could have exfiltrated env vars.

## Browserbase session data retention

The Form-Filler agent's browser sessions (and any recordings/screenshots Browserbase itself retains — separate from the screenshot this app stores in Supabase Storage) can contain filled-in PII: name, contact info, resume content, EEO answers. Treat them the same as the `application-screenshots` Storage bucket:

- Set a retention window in the Browserbase dashboard (Project Settings → session retention) rather than relying on the default — 30 days is a reasonable starting point, shorter if you don't need historical debugging.
- The app's own copy (`applications.form_screenshot_storage_path`, Supabase Storage) is the one actually shown in the UI and is scoped by the same per-user Storage RLS policy as resumes (`docs/storage-setup.sql`) — that one persists until the user deletes the application or you add an explicit cleanup job, whichever comes first. No automatic expiry is implemented yet; add one (e.g. a scheduled job deleting screenshots for applications older than N months) before this matters at scale.
