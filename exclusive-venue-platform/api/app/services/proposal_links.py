"""Tokenized shareable proposal links (task G1/G5 data contract). Token
generation only — validating a token against the DB (expiry/revocation)
lives in routers/public_proposals.py, the one place anon reads a proposal.
"""

import secrets
from datetime import UTC, datetime, timedelta

DEFAULT_TOKEN_TTL_DAYS = 30


def generate_token() -> str:
    # >=32 bytes of randomness per erd.md §5; token_urlsafe(32) yields 43
    # base64url characters, well over that floor.
    return secrets.token_urlsafe(32)


def default_expiry() -> datetime:
    return datetime.now(UTC) + timedelta(days=DEFAULT_TOKEN_TTL_DAYS)
