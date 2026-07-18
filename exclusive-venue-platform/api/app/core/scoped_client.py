"""Per-request Supabase client bound to the caller's own session.

Trust boundary (memory/constitution.md #1): FastAPI does deterministic
CRUD, but *who can see or write which row* is enforced by Postgres RLS
(has_role()/ownership policies shipped with each migration), never by
app-layer conditionals. Using the publishable key + the caller's JWT here
— instead of the secret key — means every query in this router runs as
that user, so RLS is the only thing standing between a landlord and
someone else's venue.
"""

from fastapi import Header, HTTPException, status
from supabase import Client, create_client

from app.core.config import get_settings


def get_scoped_client(authorization: str = Header(default="")) -> Client:
    if not authorization.startswith("Bearer "):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing bearer token")

    token = authorization.removeprefix("Bearer ").strip()
    settings = get_settings()

    # A FRESH client (and connection pool) per request — deliberately not
    # cached. A cached client's keep-alive connections go stale when
    # Supabase's pooler closes idle ones, and the next request reusing a
    # dead connection fails with httpx.RemoteProtocolError ("Server
    # disconnected") → a 500 that intermittently breaks venue/proposal
    # loading. A fresh pool each request avoids that entirely. The auth
    # round-trip (the far bigger per-request cost) is still cached in
    # app/core/auth.py, so this only pays a TLS handshake, not a login.
    client = create_client(settings.supabase_url, settings.supabase_publishable_key)
    client.postgrest.auth(token)
    return client
