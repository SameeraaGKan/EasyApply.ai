from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Shared secret Next.js sends as `Authorization: Bearer <token>` on every
    # call into this service. This is the internal-service trust boundary —
    # see plan Section 3 (trust boundaries).
    agent_service_bearer_token: str

    # Used to verify the Supabase-issued end-user JWT that Next.js forwards
    # alongside internal requests, so agents know which user they're acting
    # for. This is signature verification only against Supabase's public
    # JWKS — the Python service never calls Supabase's data APIs.
    supabase_project_url: str

    anthropic_api_key: str
    voyage_api_key: str

    # Neon Postgres. Plan Section 2 calls for two distinct, narrowly-scoped
    # roles (JWT-passthrough for user-owned tables vs. a service role
    # limited to job_postings) rather than one broad credential — until
    # Neon RLS/Authorize is wired up for direct (non-HTTP) connections,
    # every query in this service explicitly filters by user_id as the
    # enforcement mechanism (see plan Section 2's phased-rollout note and
    # app/db.py), so a single connection string is sufficient for now.
    database_url: str

    # Browserbase (plan Section 3/4.4 — the form-filler runs browser
    # sessions here in production). Optional: when unset, the form-filler
    # falls back to a locally-launched headless Chromium (app/browser/
    # session.py) so this agent works in local dev without a Browserbase
    # account — see README. Never falls back silently in a deployed
    # environment that expects Browserbase; it's a dev convenience gated
    # purely on whether these are configured.
    browserbase_api_key: str | None = None
    browserbase_project_id: str | None = None

    # AES-256 key (base64, 32 raw bytes) for the voluntary EEO field
    # encryption in app/crypto.py — must match web's PROFILE_ENCRYPTION_KEY
    # exactly, same value on both sides. Optional here because only the
    # form-filler agent needs to decrypt; every other agent leaves these
    # columns untouched.
    profile_encryption_key: str | None = None

    # Error tracking (plan Section 7 — observability). Optional; the SDK
    # no-ops safely when unset (verified locally) so there's nothing to
    # configure for local dev, but set this before public launch.
    sentry_dsn: str | None = None

    @property
    def supabase_jwks_url(self) -> str:
        return f"{self.supabase_project_url.rstrip('/')}/auth/v1/.well-known/jwks.json"


settings = Settings()  # type: ignore[call-arg]
