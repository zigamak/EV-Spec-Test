"""Unit tests for the staff-session verification cache (app/core/auth.py).
Verifies the network call to Supabase's Auth API is skipped for repeat
calls with the same token within the TTL — this is the actual fix for
pages that fire several requests per load feeling slow (16 Jul finding).

Also covers the thundering-herd fix (23 Jul): a cold cache alone doesn't
help when several requests for the SAME token arrive concurrently — a
plain "check, then set" lets every one of them slip past the (still
empty) cache check and independently hit Supabase's Auth API. Confirmed
live: 8 concurrent requests each paying the full ~1-2s round trip instead
of one paying it and the rest reusing the result."""

import threading
import time

import pytest
from fastapi import HTTPException

import app.core.auth as auth_module
from app.core.auth import require_staff_session


class FakeUser:
    id = "user-123"
    email = "test@user.com"


class FakeAuthResponse:
    user = FakeUser()


class FakeAuth:
    def __init__(self, delay: float = 0.0):
        self.call_count = 0
        self._delay = delay

    def get_user(self, token):
        self.call_count += 1
        if self._delay:
            time.sleep(self._delay)
        return FakeAuthResponse()


class FakeAdminClient:
    def __init__(self):
        self.auth = FakeAuth()


@pytest.fixture(autouse=True)
def _clear_cache():
    auth_module._session_cache.clear()
    yield
    auth_module._session_cache.clear()


def test_repeat_calls_with_same_token_hit_cache_not_network(monkeypatch):
    fake_client = FakeAdminClient()
    monkeypatch.setattr(auth_module, "_admin_client", lambda: fake_client)

    require_staff_session("Bearer token-a")
    require_staff_session("Bearer token-a")
    require_staff_session("Bearer token-a")

    assert fake_client.auth.call_count == 1


def test_different_tokens_each_verify_once(monkeypatch):
    fake_client = FakeAdminClient()
    monkeypatch.setattr(auth_module, "_admin_client", lambda: fake_client)

    require_staff_session("Bearer token-a")
    require_staff_session("Bearer token-b")

    assert fake_client.auth.call_count == 2


def test_expired_cache_entry_reverifies(monkeypatch):
    fake_client = FakeAdminClient()
    monkeypatch.setattr(auth_module, "_admin_client", lambda: fake_client)
    monkeypatch.setattr(auth_module, "_SESSION_CACHE_TTL_SECONDS", 0.05)

    require_staff_session("Bearer token-a")
    time.sleep(0.1)
    require_staff_session("Bearer token-a")

    assert fake_client.auth.call_count == 2


def test_missing_bearer_prefix_rejected():
    with pytest.raises(HTTPException) as exc_info:
        require_staff_session("garbage")
    assert exc_info.value.status_code == 401


def test_concurrent_calls_with_same_cold_token_verify_only_once(monkeypatch):
    """The actual regression this covers: a page firing N parallel
    requests (e.g. Pipeline: /enquiries, /proposals, /me, /staff) all
    arrive with an empty cache at the same time. Without the per-token
    lock, every one of them independently calls Supabase; with it, only
    the first does, and the rest block until it's done and reuse the
    result."""
    fake_client = FakeAdminClient()
    fake_client.auth = FakeAuth(delay=0.2)
    monkeypatch.setattr(auth_module, "_admin_client", lambda: fake_client)

    barrier = threading.Barrier(8)

    def call():
        barrier.wait()  # line every thread up so they hit the cold cache together
        return require_staff_session("Bearer token-concurrent")

    threads = [threading.Thread(target=call) for _ in range(8)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert fake_client.auth.call_count == 1
