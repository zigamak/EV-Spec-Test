"""Unit tests for Svix-style webhook signature verification (task C4).
No network/Resend account involved — signs payloads with a locally
generated test secret to verify the scheme is implemented correctly."""

import base64
import hashlib
import hmac
import time

import pytest

from app.services.webhook_verification import (
    TIMESTAMP_TOLERANCE_SECONDS,
    WebhookVerificationError,
    verify_svix_signature,
)

TEST_SECRET = "whsec_" + base64.b64encode(b"0123456789abcdef0123456789abcdef").decode()


def _sign(secret: str, svix_id: str, timestamp: str, body: bytes) -> str:
    key = base64.b64decode(secret[len("whsec_") :])
    signed_content = f"{svix_id}.{timestamp}.{body.decode()}"
    sig = base64.b64encode(hmac.new(key, signed_content.encode(), hashlib.sha256).digest()).decode()
    return f"v1,{sig}"


def test_valid_signature_passes():
    body = b'{"type": "email.received"}'
    svix_id = "msg_test123"
    timestamp = str(int(time.time()))
    signature = _sign(TEST_SECRET, svix_id, timestamp, body)
    verify_svix_signature(TEST_SECRET, svix_id, timestamp, signature, body)  # does not raise


def test_tampered_body_fails():
    body = b'{"type": "email.received"}'
    svix_id = "msg_test123"
    timestamp = str(int(time.time()))
    signature = _sign(TEST_SECRET, svix_id, timestamp, body)
    with pytest.raises(WebhookVerificationError):
        verify_svix_signature(TEST_SECRET, svix_id, timestamp, signature, b'{"type": "tampered"}')


def test_wrong_secret_fails():
    body = b'{"type": "email.received"}'
    svix_id = "msg_test123"
    timestamp = str(int(time.time()))
    other_secret = "whsec_" + base64.b64encode(b"ffffffffffffffffffffffffffffffff").decode()
    signature = _sign(other_secret, svix_id, timestamp, body)
    with pytest.raises(WebhookVerificationError):
        verify_svix_signature(TEST_SECRET, svix_id, timestamp, signature, body)


def test_stale_timestamp_fails():
    body = b'{"type": "email.received"}'
    svix_id = "msg_test123"
    stale_timestamp = str(int(time.time()) - TIMESTAMP_TOLERANCE_SECONDS - 60)
    signature = _sign(TEST_SECRET, svix_id, stale_timestamp, body)
    with pytest.raises(WebhookVerificationError):
        verify_svix_signature(TEST_SECRET, svix_id, stale_timestamp, signature, body)


def test_multiple_signatures_one_valid_passes():
    """Svix's own rotation scheme sends multiple space-separated
    signatures; verification should pass if ANY of them matches."""
    body = b'{"type": "email.received"}'
    svix_id = "msg_test123"
    timestamp = str(int(time.time()))
    real_signature = _sign(TEST_SECRET, svix_id, timestamp, body)
    combined = f"v1,bogus_signature_value {real_signature}"
    verify_svix_signature(TEST_SECRET, svix_id, timestamp, combined, body)  # does not raise
