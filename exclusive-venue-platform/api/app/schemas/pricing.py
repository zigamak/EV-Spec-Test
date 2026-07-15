"""Validation schemas for the pricing domain (erd.md §4, task F1). Mirrors
migrations/versions/0005_pricing_rules.py.
"""

from datetime import date, datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field

AddonPricingType = Literal["flat", "per_head", "per_hour"]


class PricingRuleCreate(BaseModel):
    currency: str = "HKD"
    base_rate: float = Field(ge=0)
    per_head_tiers: list[dict[str, Any]] = Field(default_factory=list)
    duration_multipliers: dict[str, Any] = Field(default_factory=dict)
    day_adjustments: dict[str, float] = Field(default_factory=dict)
    season_adjustments: list[dict[str, Any]] = Field(default_factory=list)
    min_spend: float | None = Field(default=None, ge=0)
    notes: str | None = None
    effective_from: date
    effective_to: date | None = None


class PricingRuleUpdate(BaseModel):
    currency: str | None = None
    base_rate: float | None = Field(default=None, ge=0)
    per_head_tiers: list[dict[str, Any]] | None = None
    duration_multipliers: dict[str, Any] | None = None
    day_adjustments: dict[str, float] | None = None
    season_adjustments: list[dict[str, Any]] | None = None
    min_spend: float | None = Field(default=None, ge=0)
    notes: str | None = None
    effective_from: date | None = None
    effective_to: date | None = None


class PricingRule(BaseModel):
    id: UUID
    venue_id: UUID
    currency: str
    base_rate: float
    per_head_tiers: list[dict[str, Any]]
    duration_multipliers: dict[str, Any]
    day_adjustments: dict[str, float]
    season_adjustments: list[dict[str, Any]]
    min_spend: float | None
    notes: str | None
    effective_from: date
    effective_to: date | None
    created_at: datetime
    updated_at: datetime


class PricingRuleAddonCreate(BaseModel):
    name: str = Field(min_length=1)
    pricing_type: AddonPricingType
    amount: float = Field(ge=0)


class PricingRuleAddonUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1)
    pricing_type: AddonPricingType | None = None
    amount: float | None = Field(default=None, ge=0)


class PricingRuleAddon(BaseModel):
    id: UUID
    pricing_rules_id: UUID
    name: str
    pricing_type: AddonPricingType
    amount: float
    created_at: datetime
    updated_at: datetime


class QuoteRequest(BaseModel):
    guest_count: int = Field(gt=0)
    event_date: date
    duration_hours: float = Field(gt=0)
    addon_ids: list[UUID] = Field(default_factory=list)


class QuoteBreakdown(BaseModel):
    currency: str
    base_rate: float
    per_head_total: float
    day_adjustment_multiplier: float
    season_adjustment_multiplier: float
    pre_adjustment_subtotal: float
    adjusted_subtotal: float
    duration_overtime_amount: float
    addons_total: float
    addons: list[dict[str, Any]]
    subtotal: float
    min_spend_applied: bool
    total: float
    pricing_rules_id: UUID
