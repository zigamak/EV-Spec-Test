"""Unit tests for the staff-session verification cache (app/core/auth.py).
Verifies the network call to Supabase's Auth API is skipped for repeat
calls with the same token within the TTL — this is the actual fix for
pages that fire several requests per load feeling slow (16 Jul finding)."""

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
    def __init__(self):
        self.call_count = 0

    def get_user(self, token):
        self.call_count += 1
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
