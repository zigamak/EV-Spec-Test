"""Resend inbound-email webhook payload shape (task C4).

**Unverified against a live payload** — this project has no Resend
account/inbound-domain configured in this environment (same category of
gap as the missing OPENAI_API_KEY elsewhere), so this schema is written
from Resend's public webhook documentation, not a captured real payload.
Parsing is deliberately permissive (most fields optional) so an
unexpected real-world shape fails soft (missing fields) rather than
hard (422) — the raw body is stored either way via raw_payload.
"""

from typing import Any

from pydantic import BaseModel, Field


class ResendInboundEmailData(BaseModel):
    from_: str | None = Field(default=None, alias="from")
    to: list[str] | str | None = None
    subject: str | None = None
    text: str | None = None
    html: str | None = None

    model_config = {"populate_by_name": True}


class ResendInboundEmailEvent(BaseModel):
    type: str
    data: ResendInboundEmailData = ResendInboundEmailData()
    raw_payload: dict[str, Any] = {}
