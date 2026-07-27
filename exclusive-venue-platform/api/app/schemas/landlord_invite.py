"""Validation schemas for landlord invites (erd.md §6a, task B1). Mirrors
migrations/versions/0026_landlord_invites.py.
"""

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

InviteStatus = Literal["pending", "accepted", "expired"]


class LandlordInviteCreate(BaseModel):
    # Plain str, not EmailStr, matching the existing convention across the
    # codebase (enquiry.py's contact email fields) — no email-validator
    # dependency in api/requirements.txt to add just for this one field.
    email: str = Field(min_length=3)


class LandlordInvite(BaseModel):
    id: UUID
    email: str
    invited_by: UUID
    status: InviteStatus
    invited_at: datetime
    accepted_at: datetime | None
    created_at: datetime
    updated_at: datetime
