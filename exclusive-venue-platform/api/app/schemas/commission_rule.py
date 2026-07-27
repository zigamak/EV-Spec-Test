"""Validation schemas for the commission ruleset (erd.md §6b). Mirrors
migrations/versions/0033_commission_rules.py — same versioned-by-
effective_from/effective_to discipline as pricing_rules (§4), so a rate
change never retroactively alters an already-completed order.
"""

from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, Field


class CommissionRuleCreate(BaseModel):
    vendor_id: UUID | None = None
    percentage_rate: float = Field(ge=0, le=100)
    fixed_fee: float = Field(default=0, ge=0)
    currency: str = "HKD"
    effective_from: date
    effective_to: date | None = None


class CommissionRule(BaseModel):
    id: UUID
    vendor_id: UUID | None
    percentage_rate: float
    fixed_fee: float
    currency: str
    effective_from: date
    effective_to: date | None
    created_at: datetime
    updated_at: datetime
