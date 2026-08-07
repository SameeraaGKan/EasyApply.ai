import hmac

import jwt
from fastapi import Header, HTTPException, status
from jwt import PyJWKClient

from app.config import settings

# Cached across requests — PyJWKClient handles its own key-set refresh/cache.
_jwks_client = PyJWKClient(settings.supabase_jwks_url)


def require_internal_auth(authorization: str | None = Header(default=None)) -> None:
    """Verifies the shared bearer secret Next.js sends on every call into
    this service. Raises 401 whether the header is missing or wrong, so
    callers can't distinguish the two. Use as a route dependency on every
    endpoint — this service should never be reachable without it."""
    scheme, _, token = (authorization or "").partition(" ")
    if scheme.lower() != "bearer" or not hmac.compare_digest(
        token, settings.agent_service_bearer_token
    ):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")


def verify_user_jwt(token: str) -> dict:
    """Verifies a Supabase-issued end-user access token's signature against
    Supabase's public JWKS (no network call to Supabase's data layer — this
    is signature verification only). Returns the decoded claims, including
    `sub` (the user's id, matching Neon's `users.id`).

    Raises jwt.PyJWTError on an invalid/expired/malformed token — callers
    should turn that into a 401.
    """
    signing_key = _jwks_client.get_signing_key_from_jwt(token)
    return jwt.decode(
        token,
        signing_key.key,
        algorithms=["ES256", "RS256"],
        audience="authenticated",
        options={"require": ["exp", "sub"]},
    )
