"""Staff session verification (blocks every authenticated route — task A2).

Deterministic identity check only: verifies the caller's session against
Supabase's Auth API (not a local JWT decode — this project uses Supabase's
newer asymmetric-signing key system, `sb_publishable_...`/`sb_secret_...` +
a JWKS endpoint, so there is no shared HS256 secret to decode with locally).
Role authorization happens at the DB layer via `has_role()` + RLS, never
here — this module only confirms *who* is calling, not what they can do.

**Performance note (found live, 16 Jul):** verifying against Supabase's
Auth API is a real network round-trip (~1-2s observed), and a page that
fires several requests (Calendar, the proposal editor) was paying that
cost on *every single one* — the actual cause of pages feeling slow, not
a bug in the request/response cycle itself. A short-lived in-process
cache keyed by the raw token avoids re-verifying the same session
multiple times within one page load, while still re-checking often
enough that a revoked session stops working within seconds, not hours.

**Thundering-herd fix (found live, 23 Jul):** the cache above only helps
once it's warm. A page loading cold fires several `apiFetch` calls at
once (e.g. Pipeline: /enquiries, /proposals, /me, /staff), and every one
of them arrives here with an empty cache — a plain "check, then set" has
no way to stop all of them from independently paying the full Supabase
round-trip in parallel, measured live as ~8 concurrent requests each
taking 2-4.5s instead of one paying it and the rest reusing the result.
The per-token lock below coalesces that: whichever request gets there
first does the real verification and populates the cache; every other
request for the *same token* blocks on that one's result instead of
starting a second (or eighth) redundant call. Requests for *different*
tokens never contend with each other — each token gets its own lock.
"""

import threading
import time
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


_SESSION_CACHE_TTL_SECONDS = 30
_session_cache: dict[str, tuple[float, StaffUser]] = {}

# One lock per token currently being verified, so concurrent requests for
# the same token coalesce into a single Supabase call instead of each
# starting its own. `_locks_guard` only protects creating/removing entries
# in this dict, never the (potentially slow) verification itself.
_inflight_locks: dict[str, threading.Lock] = {}
_locks_guard = threading.Lock()


def _lock_for(token: str) -> threading.Lock:
    with _locks_guard:
        lock = _inflight_locks.get(token)
        if lock is None:
            lock = threading.Lock()
            _inflight_locks[token] = lock
        return lock


def _prune_expired_sessions() -> None:
    now = time.monotonic()
    expired = [
        t for t, (cached_at, _) in _session_cache.items() if now - cached_at > _SESSION_CACHE_TTL_SECONDS
    ]
    for t in expired:
        del _session_cache[t]

    # Best-effort: drop locks for tokens that aren't cached and aren't
    # actively held. Tokens rotate (refresh/re-login), so without this the
    # dict would slowly accumulate one abandoned Lock per token ever seen.
    with _locks_guard:
        stale = [t for t, lock in _inflight_locks.items() if t not in _session_cache and not lock.locked()]
        for t in stale:
            del _inflight_locks[t]


def require_staff_session(authorization: str = Header(default="")) -> StaffUser:
    if not authorization.startswith("Bearer "):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing bearer token")

    token = authorization.removeprefix("Bearer ").strip()

    cached = _session_cache.get(token)
    if cached is not None and time.monotonic() - cached[0] <= _SESSION_CACHE_TTL_SECONDS:
        return cached[1]

    with _lock_for(token):
        # Re-check inside the lock: another thread may have just finished
        # verifying this exact token while we were waiting our turn.
        cached = _session_cache.get(token)
        if cached is not None and time.monotonic() - cached[0] <= _SESSION_CACHE_TTL_SECONDS:
            return cached[1]

        try:
            response = _admin_client().auth.get_user(token)
        except Exception as exc:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired session") from exc

        user = response.user if response else None
        if user is None:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired session")

        staff_user = StaffUser(user_id=user.id, email=user.email)
        _prune_expired_sessions()
        _session_cache[token] = (time.monotonic(), staff_user)
        return staff_user
