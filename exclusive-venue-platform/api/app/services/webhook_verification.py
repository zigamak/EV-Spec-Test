"""Webhook signature verification (task C4). Resend signs inbound webhooks
using the Svix scheme: HMAC-SHA256 over "{id}.{timestamp}.{body}" with a
base64-decoded, "whsec_"-prefixed secret, base64-encoded, compared against
one or more "v1,<sig>" space-separated values in the svix-signature header.

This is the one part of the public intake path where an attacker-supplied
payload reaches deterministic code before any human review — verify
first, parse second, always. A missing/invalid signature is a hard
rejection (503/401), never a silent skip, unlike the AI call paths (D1/E2)
which degrade to a clear error for a *staff-initiated* action instead.
"""

import base64
import hashlib
import hmac
import time

# Reject webhooks whose declared timestamp is further than this from now,
# in either direction — the standard Svix replay-window recommendation.
TIMESTAMP_TOLERANCE_SECONDS = 5 * 60


class WebhookVerificationError(ValueError):
    pass


def verify_svix_signature(
    secret: str,
    svix_id: str,
    svix_timestamp: str,
    svix_signature: str,
    body: bytes,
) -> None:
    """Raises WebhookVerificationError if the signature doesn't check out.
    Returns None (does not raise) on success."""
    try:
        timestamp = int(svix_timestamp)
    except ValueError as exc:
        raise WebhookVerificationError("Invalid svix-timestamp header") from exc

    if abs(time.time() - timestamp) > TIMESTAMP_TOLERANCE_SECONDS:
        raise WebhookVerificationError("Webhook timestamp outside tolerance window")

    if not secret.startswith("whsec_"):
        raise WebhookVerificationError("Malformed webhook secret (expected whsec_ prefix)")
    key = base64.b64decode(secret[len("whsec_") :])

    signed_content = f"{svix_id}.{svix_timestamp}.{body.decode()}"
    expected = base64.b64encode(
        hmac.new(key, signed_content.encode(), hashlib.sha256).digest()
    ).decode()

    candidates = [v.split(",", 1)[1] for v in svix_signature.split() if "," in v]
    if not any(hmac.compare_digest(expected, candidate) for candidate in candidates):
        raise WebhookVerificationError("Signature mismatch")
