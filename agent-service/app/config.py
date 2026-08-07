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

    @property
    def supabase_jwks_url(self) -> str:
        return f"{self.supabase_project_url.rstrip('/')}/auth/v1/.well-known/jwks.json"


settings = Settings()  # type: ignore[call-arg]
