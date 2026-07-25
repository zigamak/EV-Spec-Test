"""In-memory rate limiting for the public, unauthenticated proposal
endpoints (GET /public/proposals/{token}, POST .../events) — the only
routes in this API anyone on the internet can hit without a session, and
the only ones that bypass RLS entirely via the service-role client (see
routers/public_proposals.py's own docstring). Nothing today stops someone
hammering a token (scraping, or spamming venue_seen/open events to
inflate the analytics just shipped) or brute-force-guessing tokens.

Same in-memory, single-process pattern already used for the auth session
cache (app/core/auth.py) rather than adding a Redis dependency for
something this size — same tradeoff, explicitly noted there too: state
resets on restart, and doesn't share across multiple instances/processes.
If this API ever runs as more than one instance, this needs to move to a
shared store — noted here, not solved, since nothing in this deployment
does that yet.

Two separate limiters, both must pass:
  - per-IP: catches broad abuse (scraping many tokens from one source).
  - per-token: catches one link being hammered even from rotating IPs.
"""

import threading
import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request, status


class _SlidingWindowLimiter:
    def __init__(self, max_requests: int, window_seconds: float):
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def check(self, key: str) -> tuple[bool, float]:
        """Returns (allowed, retry_after_seconds). Records the hit only
        when allowed, so a blocked caller retrying immediately doesn't
        push their own window back further."""
        now = time.monotonic()
        with self._lock:
            hits = self._hits[key]
            cutoff = now - self.window_seconds
            while hits and hits[0] < cutoff:
                hits.popleft()
            if len(hits) >= self.max_requests:
                retry_after = hits[0] + self.window_seconds - now
                return False, max(retry_after, 0.0)
            hits.append(now)
            return True, 0.0

    def prune(self) -> None:
        """Drop keys with nothing left in the window — called
        opportunistically so this dict doesn't grow unbounded over a
        long-running process (mirrors auth.py's _prune_expired_sessions)."""
        now = time.monotonic()
        cutoff = now - self.window_seconds
        with self._lock:
            stale = [k for k, hits in self._hits.items() if not hits or hits[-1] < cutoff]
            for k in stale:
                del self._hits[k]


# Generous enough for a real visitor loading the page, scrolling through
# several venue options, and reloading once or twice; tight enough that
# sustained scraping/spamming gets a 429 well before doing real damage.
_ip_limiter = _SlidingWindowLimiter(max_requests=60, window_seconds=60)
_token_limiter = _SlidingWindowLimiter(max_requests=30, window_seconds=60)

_PRUNE_EVERY_N_CHECKS = 500
_check_count = 0
_count_lock = threading.Lock()


def enforce_public_rate_limit(request: Request, token: str) -> None:
    """FastAPI dependency — raises 429 if either limiter is exhausted."""
    global _check_count
    client_ip = request.client.host if request.client else "unknown"

    for limiter, key in ((_ip_limiter, client_ip), (_token_limiter, token)):
        allowed, retry_after = limiter.check(key)
        if not allowed:
            raise HTTPException(
                status.HTTP_429_TOO_MANY_REQUESTS,
                "Too many requests — please try again shortly.",
                headers={"Retry-After": str(int(retry_after) + 1)},
            )

    with _count_lock:
        _check_count += 1
        should_prune = _check_count % _PRUNE_EVERY_N_CHECKS == 0
    if should_prune:
        _ip_limiter.prune()
        _token_limiter.prune()
