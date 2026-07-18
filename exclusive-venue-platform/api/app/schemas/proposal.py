"""Validation schemas for the proposal domain (erd.md §5, task G1). Mirrors
migrations/versions/0006_proposals.py, as revised by
0008_brief_standardization.py (event_date, personal_email_copy — 18 Jul).
"""

from datetime import date, datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field

ProposalStatus = Literal["draft", "pending_approval", "sent", "viewed", "accepted", "declined"]
ProposalOrigin = Literal["staff", "concierge"]


class ProposalCreate(BaseModel):
    enquiry_id: UUID
    brief_id: UUID
    title: str = Field(min_length=1)
    intro_copy: str | None = None
    legal_boilerplate: str | None = None
    currency: str = "HKD"
    origin: ProposalOrigin = "staff"
    # The date actually locked for this proposal (e.g. from the brief's
    # date_suggestions, or a date the client confirmed) — distinct from
    # the brief's date_window_start/end, which may still span a range.
    event_date: date | None = None
    # AI-drafted note that accompanies the sent proposal (task D5, 18
    # Jul) — a separate artifact from intro_copy, which lives inside the
    # proposal page itself. Confirmed as a real reference-site feature,
    # not a speculative addition: the operator console logs it to the
    # client timeline as its own message alongside the proposal link/PDF.
    personal_email_copy: str | None = None


class ProposalUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1)
    intro_copy: str | None = None
    legal_boilerplate: str | None = None
    status: ProposalStatus | None = None
    event_date: date | None = None
    personal_email_copy: str | None = None


class Proposal(BaseModel):
    id: UUID
    enquiry_id: UUID
    brief_id: UUID
    status: ProposalStatus
    title: str
    intro_copy: str | None
    legal_boilerplate: str | None
    currency: str
    origin: ProposalOrigin
    event_date: date | None
    personal_email_copy: str | None
    created_by: UUID | None
    sent_at: datetime | None
    created_at: datetime
    updated_at: datetime


class ProposalVenueCreate(BaseModel):
    venue_id: UUID
    configuration_id: UUID
    pricing_rules_id: UUID
    quote_breakdown: dict[str, Any]
    quote_total: float = Field(ge=0)
    venue_copy: str | None = None
    sort_order: int = 0
    recommended: bool = False


class ProposalVenueUpdate(BaseModel):
    venue_copy: str | None = None
    sort_order: int | None = None
    recommended: bool | None = None


class ProposalVenue(BaseModel):
    id: UUID
    proposal_id: UUID
    venue_id: UUID
    configuration_id: UUID
    pricing_rules_id: UUID
    quote_breakdown: dict[str, Any]
    quote_total: float
    venue_copy: str | None
    sort_order: int
    recommended: bool
    created_at: datetime
    updated_at: datetime


class ProposalLinkToken(BaseModel):
    id: UUID
    proposal_id: UUID
    token: str
    expires_at: datetime
    revoked: bool
    created_at: datetime


class PublicProposalVenue(BaseModel):
    """What the anon-facing public link page (G5) may see — no internal
    ids beyond what's needed to render, no pricing_rules_id (commercial
    IP), no configuration_id."""

    venue_id: UUID
    venue_name: str
    configuration_name: str
    quote_total: float
    venue_copy: str | None
    sort_order: int
    recommended: bool


class PublicProposal(BaseModel):
    title: str
    intro_copy: str | None
    legal_boilerplate: str | None
    currency: str
    status: ProposalStatus
    venues: list[PublicProposalVenue]
