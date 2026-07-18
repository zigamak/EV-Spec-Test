"""Validation schemas for the enquiry intake domain (erd.md §5). Mirrors
the CHECK constraints in migrations/versions/0003_enquiry_intake.py, as
revised by 0007_enquiry_stage_revamp.py (stage, 18 Jul) and
0008_brief_standardization.py (channel/source 'whatsapp' + organisation
tier/rate-card fields, same day).
"""

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, computed_field

from app.schemas.brief import Brief
from app.services.stage_machine import EnquiryStatus, stage_to_status

OrganisationKind = Literal["corporate", "agency", "brand", "production_house", "other"]
OrganisationTier = Literal["tier-1", "tier-2", "standard"]
ContactSource = Literal["email", "web_form", "concierge", "manual", "whatsapp"]
EnquiryChannel = Literal["email", "web_form", "manual", "concierge", "whatsapp"]
EnquiryStage = Literal["enquiry", "briefed", "proposed", "held", "signed", "lost"]


class OrganisationCreate(BaseModel):
    name: str = Field(min_length=1)
    kind: OrganisationKind = "other"
    tier: OrganisationTier | None = None
    rate_card_on_file: bool = False
    rate_card_terms: str | None = None
    region: str | None = None


class OrganisationUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1)
    kind: OrganisationKind | None = None
    tier: OrganisationTier | None = None
    rate_card_on_file: bool | None = None
    rate_card_terms: str | None = None
    region: str | None = None


class Organisation(BaseModel):
    id: UUID
    name: str
    kind: OrganisationKind
    # Client-context fields (task D5, 18 Jul) — surfaced on the enquiry/
    # proposal UI the way the reference prototype's client panel does
    # ("Tier-1 · Maison", "rate card on file"). Lifetime value / win rate
    # / open-proposals-count are deliberately NOT columns here — same
    # computed-not-stored pattern as enquiries.status (erd.md §5.1);
    # they're aggregated from proposals/enquiries at query time.
    tier: OrganisationTier | None
    rate_card_on_file: bool
    rate_card_terms: str | None
    region: str | None
    created_at: datetime
    updated_at: datetime


class ContactCreate(BaseModel):
    full_name: str = Field(min_length=1)
    email: str | None = None
    phone: str | None = None
    organisation_id: UUID | None = None
    source: ContactSource


class ContactUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=1)
    email: str | None = None
    phone: str | None = None
    organisation_id: UUID | None = None


class Contact(BaseModel):
    id: UUID
    full_name: str
    email: str | None
    phone: str | None
    organisation_id: UUID | None
    source: ContactSource
    created_at: datetime
    updated_at: datetime


class EnquiryCreate(BaseModel):
    contact_id: UUID | None = None
    channel: EnquiryChannel
    raw_content: str = Field(min_length=1)
    assigned_to: UUID | None = None


class EnquiryUpdate(BaseModel):
    """Stage is deliberately not editable here — every stage change must
    go through POST /enquiries/{id}/transition (task H1's stage machine),
    which validates the transition graph. A bare PATCH could otherwise
    jump straight from 'enquiry' to 'signed'."""

    contact_id: UUID | None = None
    lost_reason: str | None = None
    # Team hand-off (task H5) — see migration 0009. forwarded_to is a name,
    # not an auth.users id (that's assigned_to); forward_note is timeline copy.
    forwarded_to: str | None = None
    forward_note: str | None = None


class Enquiry(BaseModel):
    id: UUID
    contact_id: UUID | None
    channel: EnquiryChannel
    raw_content: str
    stage: EnquiryStage
    assigned_to: UUID | None
    created_by: UUID | None
    lost_reason: str | None
    forwarded_to: str | None
    forward_note: str | None
    created_at: datetime
    updated_at: datetime

    @computed_field  # type: ignore[prop-decorator]
    @property
    def status(self) -> EnquiryStatus:
        """Salesperson/reporting-facing rollup (Open/Awaiting/Won/Lost),
        computed from `stage` at serialization time — never a stored
        column. See erd.md §5.1 and app/services/stage_machine.py."""
        return stage_to_status(self.stage)


class EnquiryWithBriefs(Enquiry):
    """`GET /enquiries` embeds every brief version via a single PostgREST
    query (`select=*,briefs(*)`) instead of the list endpoint's callers
    each looping back with one `GET .../briefs` per enquiry — found live
    16 Jul: that N+1 pattern, combined with this project's Supabase
    project being in a different region than wherever the API runs, was
    the actual cause of the Pipeline Board and Calendar feeling slow, not
    a FastAPI/React incompatibility. Pick the latest by `version` client-
    side rather than relying on PostgREST's embedded-resource ordering,
    which isn't reliably supported across versions."""

    briefs: list[Brief] = Field(default_factory=list)
