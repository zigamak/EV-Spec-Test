"""Staff session verification (blocks every authenticated route — task A2).

Deterministic identity check only: verifies the caller's session against
Supabase's Auth API (not a local JWT decode — this project uses Supabase's
newer asymmetric-signing key system, `sb_publishable_...`/`sb_secret_...` +
a JWKS endpoint, so there is no shared HS256 secret to decode with locally).
Role authorization happens at the DB layer via `has_role()` + RLS, never
here — this module only confirms *who* is calling, not what they can do.
"""

from functools import lru_cache

from fastapi import Header, HTTPException, status
from supabase import Client, create_client

from app.core.config import get_settings


class StaffUser:
    def __init__(self, user_id: str, email: str | None):
        self.user_id = user_id
        self.email = email


@lru_cache
def _admin_client() -> Client:
    settings = get_settings()
    return create_client(settings.supabase_url, settings.supabase_secret_key)


def require_staff_session(authorization: str = Header(default="")) -> StaffUser:
    if not authorization.startswith("Bearer "):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing bearer token")

    token = authorization.removeprefix("Bearer ").strip()

    try:
        response = _admin_client().auth.get_user(token)
    except Exception as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired session") from exc

    user = response.user if response else None
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired session")

    return StaffUser(user_id=user.id, email=user.email)
