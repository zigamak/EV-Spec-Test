"""Rate limiter unit tests (app/core/rate_limit.py) — the guard on the
public, unauthenticated proposal endpoints."""

import time

from fastapi import HTTPException
import pytest

from app.core.rate_limit import _SlidingWindowLimiter


def test_allows_up_to_the_limit_then_blocks():
    limiter = _SlidingWindowLimiter(max_requests=3, window_seconds=10)
    for _ in range(3):
        allowed, _ = limiter.check("same-key")
        assert allowed
    allowed, retry_after = limiter.check("same-key")
    assert not allowed
    assert retry_after > 0


def test_different_keys_are_independent():
    limiter = _SlidingWindowLimiter(max_requests=1, window_seconds=10)
    allowed_a, _ = limiter.check("a")
    allowed_b, _ = limiter.check("b")
    assert allowed_a
    assert allowed_b


def test_window_resets_after_it_elapses():
    limiter = _SlidingWindowLimiter(max_requests=1, window_seconds=0.15)
    allowed, _ = limiter.check("key")
    assert allowed
    blocked, _ = limiter.check("key")
    assert not blocked
    time.sleep(0.2)
    allowed_again, _ = limiter.check("key")
    assert allowed_again


def test_blocked_check_does_not_consume_a_slot():
    # A caller retrying immediately after being blocked shouldn't push
    # their own window back further than the first blocked attempt did.
    limiter = _SlidingWindowLimiter(max_requests=1, window_seconds=10)
    limiter.check("key")
    _, retry_after_1 = limiter.check("key")
    _, retry_after_2 = limiter.check("key")
    assert retry_after_1 == pytest.approx(retry_after_2, abs=0.05)


def test_prune_drops_stale_keys_only():
    limiter = _SlidingWindowLimiter(max_requests=5, window_seconds=0.1)
    limiter.check("stale")
    time.sleep(0.15)
    limiter.check("fresh")
    limiter.prune()
    assert "stale" not in limiter._hits
    assert "fresh" in limiter._hits


def test_enforce_public_rate_limit_raises_429(monkeypatch):
    from app.core import rate_limit as rl

    monkeypatch.setattr(rl, "_ip_limiter", rl._SlidingWindowLimiter(max_requests=1, window_seconds=10))
    monkeypatch.setattr(rl, "_token_limiter", rl._SlidingWindowLimiter(max_requests=100, window_seconds=10))

    class FakeClient:
        host = "1.2.3.4"

    class FakeRequest:
        client = FakeClient()

    rl.enforce_public_rate_limit(FakeRequest(), "token-a")
    with pytest.raises(HTTPException) as exc_info:
        rl.enforce_public_rate_limit(FakeRequest(), "token-b")
    assert exc_info.value.status_code == 429
    assert "Retry-After" in exc_info.value.headers
