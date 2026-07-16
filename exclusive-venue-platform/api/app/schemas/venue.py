"""Validation schemas for the venue domain (erd.md §4). Mirrors the CHECK
constraints in migrations/versions/0002_venue_domain.py — Postgres is the
final authority (a schema drift here just means a worse error message),
but Pydantic catches bad input before it hits the DB round-trip.
"""

from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

VenueStatus = Literal["draft", "pending_approval", "active", "inactive"]
MediaKind = Literal["photo", "video", "floor_plan"]
AvailabilityReason = Literal["booked", "hold", "maintenance", "landlord_blocked", "other"]
RestrictionKind = Literal[
    "no_amplified_music",
    "no_smoking",
    "no_open_flame",
    "min_age",
    "curfew",
    "no_red_wine",
    "other",
]


class VenueCreate(BaseModel):
    name: str = Field(min_length=1)
    slug: str = Field(min_length=1, pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
    description: str | None = None
    address: str | None = None
    district: str | None = None
    landlord_id: UUID | None = None
    status: VenueStatus = "draft"


class VenueUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1)
    slug: str | None = Field(default=None, min_length=1, pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
    description: str | None = None
    address: str | None = None
    district: str | None = None
    status: VenueStatus | None = None
    hero_media_id: UUID | None = None


class Venue(BaseModel):
    id: UUID
    name: str
    slug: str
    description: str | None
    address: str | None
    district: str | None
    landlord_id: UUID | None
    status: VenueStatus
    approved_by: UUID | None
    approved_at: datetime | None
    hero_media_id: UUID | None
    created_at: datetime
    updated_at: datetime


class VenueConfigurationCreate(BaseModel):
    name: str = Field(min_length=1)
    capacity: int = Field(gt=0)
    notes: str | None = None


class VenueConfigurationUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1)
    capacity: int | None = Field(default=None, gt=0)
    notes: str | None = None


class VenueConfiguration(BaseModel):
    id: UUID
    venue_id: UUID
    name: str
    capacity: int
    notes: str | None
    created_at: datetime
    updated_at: datetime


class VenueRestrictionCreate(BaseModel):
    kind: RestrictionKind
    value: str | None = None
    hard: bool = True


class VenueRestrictionUpdate(BaseModel):
    kind: RestrictionKind | None = None
    value: str | None = None
    hard: bool | None = None


class VenueRestriction(BaseModel):
    id: UUID
    venue_id: UUID
    kind: RestrictionKind
    value: str | None
    hard: bool
    created_at: datetime
    updated_at: datetime


class VenueAvailabilityCreate(BaseModel):
    starts_on: date
    ends_on: date
    reason: AvailabilityReason
    hold_expires_at: datetime | None = None
    note: str | None = None


class VenueAvailability(BaseModel):
    id: UUID
    venue_id: UUID
    starts_on: date
    ends_on: date
    reason: AvailabilityReason
    hold_expires_at: datetime | None
    note: str | None
    created_at: datetime
    updated_at: datetime


class VenueMediaUpdate(BaseModel):
    kind: MediaKind | None = None
    sort_order: int | None = None
    caption: str | None = None


class VenueMedia(BaseModel):
    id: UUID
    venue_id: UUID
    storage_path: str
    kind: MediaKind
    sort_order: int
    caption: str | None
    created_at: datetime
    updated_at: datetime
    url: str | None = None


class VenueWithAvailability(Venue):
    """`GET /venues/portfolio-availability` embeds each active venue's
    availability windows via a single PostgREST query instead of the
    Calendar page looping back with one `GET /venues/{id}/availability`
    per venue (found live 16 Jul as one of the two worst N+1 offenders)."""

    availability: list[VenueAvailability] = Field(default_factory=list)


class VenueWithPortfolio(Venue):
    """`GET /venues/portfolio` embeds each venue's media + configurations
    via a single PostgREST query instead of the Venues page looping back
    with two `GET`s per venue (found live 16 Jul)."""

    venue_media: list[VenueMedia] = Field(default_factory=list)
    venue_configurations: list[VenueConfiguration] = Field(default_factory=list)
