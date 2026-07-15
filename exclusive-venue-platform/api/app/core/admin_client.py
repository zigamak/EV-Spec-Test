"""Service-role Supabase client — bypasses RLS entirely. Used only where
that's the point: the public proposal-link reader (routers/
public_proposals.py) plays the role an edge function would in a pure-
Supabase stack, validating a token in code before returning anything,
since anon has no RLS policy on proposals at all (rls-matrix.md).
"""

from functools import lru_cache

from supabase import Client, create_client

from app.core.config import get_settings


@lru_cache
def get_admin_client() -> Client:
    settings = get_settings()
    return create_client(settings.supabase_url, settings.supabase_secret_key)
