"""Per-request Supabase client bound to the caller's own session.

Trust boundary (memory/constitution.md #1): FastAPI does deterministic
CRUD, but *who can see or write which row* is enforced by Postgres RLS
(has_role()/ownership policies shipped with each migration), never by
app-layer conditionals. Using the publishable key + the caller's JWT here
— instead of the secret key — means every query in this router runs as
that user, so RLS is the only thing standing between a landlord and
someone else's venue.
"""

from functools import lru_cache

from fastapi import Header, HTTPException, status
from supabase import Client, create_client

from app.core.config import get_settings


# Keyed by token — deliberately NOT one shared client whose auth header is
# reassigned per request. Route handlers are sync `def`, so FastAPI runs
# them concurrently in a threadpool; a single shared client would let one
# request overwrite another's token mid-flight and issue that request's
# query as the wrong user, which is exactly the failure RLS can't save us
# from (it would faithfully scope to whoever the header last named).
# One client per token is safe: same token means same user, so concurrent
# requests sharing an entry already share an identity.
#
# maxsize bounds how many tokens' clients (and their connection pools) we
# hold; tokens rotate roughly hourly and the LRU evicts the stale ones.
@lru_cache(maxsize=64)
def _client_for_token(token: str) -> Client:
    settings = get_settings()
    client = create_client(settings.supabase_url, settings.supabase_publishable_key)
    client.postgrest.auth(token)
    return client


def get_scoped_client(authorization: str = Header(default="")) -> Client:
    if not authorization.startswith("Bearer "):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing bearer token")

    token = authorization.removeprefix("Bearer ").strip()
    # Reused across requests from the same caller, so the TLS handshake and
    # connection pool setup are paid once per session rather than per request.
    return _client_for_token(token)
