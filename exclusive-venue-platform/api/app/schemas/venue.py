"""Validation schemas for the venue domain (erd.md §4). Mirrors the CHECK
constraints in migrations/versions/0002_venue_domain.py — Postgres is the
final authority (a schema drift here just means a worse error message),
but Pydantic catches bad input before it hits the DB round-trip.
"""

from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.pricing import PricingRule

VenueStatus = Literal["draft", "pending_approval", "active", "inactive"]
VenueCategory = Literal[
    "event_space",
    "private_property",
    "commercial_space",
    "boats_yachts",
    "member_club",
]
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
FilmStatus = Literal["planned", "in_production", "delivered"]


class VenueCreate(BaseModel):
    name: str = Field(min_length=1)
    slug: str = Field(min_length=1, pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
    description: str | None = None
    address: str | None = None
    district: str | None = None
    category: VenueCategory | None = None
    amenities: list[str] = Field(default_factory=list)
    ideal_for: list[str] = Field(default_factory=list)
    accepted_event_types: list[str] = Field(default_factory=list)
    surface_area_sqft: float | None = None
    room_count: int | None = None
    access_note: str | None = None
    view_note: str | None = None
    landlord_id: UUID | None = None
    status: VenueStatus = "draft"
    amenities: list[str] = Field(default_factory=list)


class VenueUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1)
    slug: str | None = Field(default=None, min_length=1, pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
    description: str | None = None
    address: str | None = None
    district: str | None = None
    category: VenueCategory | None = None
    amenities: list[str] | None = None
    ideal_for: list[str] | None = None
    accepted_event_types: list[str] | None = None
    surface_area_sqft: float | None = None
    room_count: int | None = None
    access_note: str | None = None
    view_note: str | None = None
    status: VenueStatus | None = None
    hero_media_id: UUID | None = None
    amenities: list[str] | None = None


class Venue(BaseModel):
    id: UUID
    name: str
    slug: str
    description: str | None
    address: str | None
    district: str | None
    category: VenueCategory | None
    amenities: list[str]
    ideal_for: list[str]
    accepted_event_types: list[str]
    surface_area_sqft: float | None
    room_count: int | None
    access_note: str | None
    view_note: str | None
    landlord_id: UUID | None
    status: VenueStatus
    amenities: list[str] = Field(default_factory=list)
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


class VenueActivationCreate(BaseModel):
    client_name: str = Field(min_length=1)
    client_category: str | None = None
    event_type: str | None = None
    event_date: date | None = None
    sort_order: int = 0


class VenueActivationUpdate(BaseModel):
    client_name: str | None = Field(default=None, min_length=1)
    client_category: str | None = None
    event_type: str | None = None
    event_date: date | None = None
    sort_order: int | None = None


class VenueActivation(BaseModel):
    id: UUID
    venue_id: UUID
    client_name: str
    client_category: str | None
    event_type: str | None
    event_date: date | None
    sort_order: int
    created_at: datetime
    updated_at: datetime


class VenueFilmCreate(BaseModel):
    title: str = Field(min_length=1)
    duration_label: str | None = None
    status: FilmStatus = "planned"
    video_media_id: UUID | None = None
    sort_order: int = 0


class VenueFilmUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1)
    duration_label: str | None = None
    status: FilmStatus | None = None
    video_media_id: UUID | None = None
    sort_order: int | None = None


class VenueFilm(BaseModel):
    id: UUID
    venue_id: UUID
    title: str
    duration_label: str | None
    status: FilmStatus
    video_media_id: UUID | None
    sort_order: int
    created_at: datetime
    updated_at: datetime
    video_url: str | None = None


class VenueTeamContactCreate(BaseModel):
    name: str = Field(min_length=1)
    role: str = Field(min_length=1)
    phone: str | None = None
    email: str | None = None
    sort_order: int = 0


class VenueTeamContactUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1)
    role: str | None = Field(default=None, min_length=1)
    phone: str | None = None
    email: str | None = None
    sort_order: int | None = None


class VenueTeamContact(BaseModel):
    id: UUID
    venue_id: UUID
    name: str
    role: str
    phone: str | None
    email: str | None
    sort_order: int
    created_at: datetime
    updated_at: datetime


class VenueWithProfile(Venue):
    """`GET /venues/{id}/profile` embeds every relation either the Venue
    Profile page or the Venue Edit page needs in one round trip (media,
    configurations, restrictions, activations, films, team contacts,
    pricing rules, availability) — same N+1-avoidance rationale as
    VenueWithPortfolio. Callers only read the fields their page needs;
    the extra fields in the payload cost nothing extra over the network
    round trips they replace."""

    venue_media: list[VenueMedia] = Field(default_factory=list)
    venue_configurations: list[VenueConfiguration] = Field(default_factory=list)
    venue_restrictions: list[VenueRestriction] = Field(default_factory=list)
    venue_activations: list[VenueActivation] = Field(default_factory=list)
    venue_films: list[VenueFilm] = Field(default_factory=list)
    venue_team_contacts: list[VenueTeamContact] = Field(default_factory=list)
    pricing_rules: list[PricingRule] = Field(default_factory=list)
    venue_availability: list[VenueAvailability] = Field(default_factory=list)
