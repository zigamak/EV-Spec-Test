"""Input/output shapes for the recommendation engine (erd.md, tasks E1/E2).
E1 (this schema's primary consumer) is a pure function over pre-fetched
data — no DB access of its own, which is what makes it unit-testable
without a live Supabase connection.
"""

from datetime import date
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.pricing import PricingRule, PricingRuleAddon


class BriefInput(BaseModel):
    guest_count: int = Field(gt=0)
    event_date: date
    duration_hours: float = Field(gt=0)
    budget_amount: float | None = Field(default=None, ge=0)
    budget_basis: Literal["total", "per_head"] | None = None
    requirements: dict[str, Any] = Field(default_factory=dict)


class ConfigurationCandidate(BaseModel):
    id: UUID
    name: str
    capacity: int


class RestrictionCandidate(BaseModel):
    kind: str
    hard: bool


class AvailabilityWindow(BaseModel):
    starts_on: date
    ends_on: date


class VenueCandidate(BaseModel):
    venue_id: UUID
    name: str
    status: str
    configurations: list[ConfigurationCandidate] = Field(default_factory=list)
    restrictions: list[RestrictionCandidate] = Field(default_factory=list)
    availability: list[AvailabilityWindow] = Field(default_factory=list)
    pricing_rule: PricingRule | None = None
    pricing_rule_addons: list[PricingRuleAddon] = Field(default_factory=list)


class ShortlistEntry(BaseModel):
    venue_id: UUID
    venue_name: str
    configuration_id: UUID
    configuration_name: str
    capacity: int
    estimated_total: float | None
    within_budget: bool | None
    sort_order: int = 0
    # Both null together iff no active pricing_rule existed for this venue
    # on the brief's event_date — carried through so a proposal (G1/G3)
    # can be built straight from a shortlist entry without re-querying or
    # re-computing the quote.
    pricing_rules_id: UUID | None = None
    quote_breakdown: dict[str, Any] | None = None


class ExclusionReason(BaseModel):
    venue_id: UUID
    venue_name: str
    reason: str


class ShortlistResponse(BaseModel):
    shortlist: list[ShortlistEntry]
    excluded: list[ExclusionReason]
