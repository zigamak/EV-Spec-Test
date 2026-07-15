"""Validation schemas for the enquiry intake domain (erd.md §5). Mirrors
the CHECK constraints in migrations/versions/0003_enquiry_intake.py.
"""

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

OrganisationKind = Literal["corporate", "agency", "brand", "production_house", "other"]
ContactSource = Literal["email", "web_form", "concierge", "manual"]
EnquiryChannel = Literal["email", "web_form", "manual", "concierge"]
EnquiryStage = Literal[
    "new", "qualified", "proposal_sent", "follow_up", "visit", "negotiation", "confirmed", "lost"
]


class OrganisationCreate(BaseModel):
    name: str = Field(min_length=1)
    kind: OrganisationKind = "other"


class OrganisationUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1)
    kind: OrganisationKind | None = None


class Organisation(BaseModel):
    id: UUID
    name: str
    kind: OrganisationKind
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
    jump straight from 'new' to 'confirmed'."""

    contact_id: UUID | None = None
    lost_reason: str | None = None


class Enquiry(BaseModel):
    id: UUID
    contact_id: UUID | None
    channel: EnquiryChannel
    raw_content: str
    stage: EnquiryStage
    assigned_to: UUID | None
    created_by: UUID | None
    lost_reason: str | None
    created_at: datetime
    updated_at: datetime
