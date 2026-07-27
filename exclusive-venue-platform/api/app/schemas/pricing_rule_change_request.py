"""Validation schemas for the landlord "propose, staff approves" pricing
workflow (erd.md §6a, task D1). Mirrors
migrations/versions/0028_pricing_rule_change_requests.py.

`payload` reuses PricingRuleCreate's shape directly — a proposed request
is structurally the same data as a real pricing_rules row, just gated
behind staff approval before it becomes one (task D3).
"""

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel

from app.schemas.pricing import PricingRuleCreate

ChangeRequestStatus = Literal["pending", "approved", "rejected"]


class PricingRuleChangeRequestCreate(BaseModel):
    pricing_rules_id: UUID | None = None
    payload: PricingRuleCreate


class PricingRuleChangeRequestReview(BaseModel):
    review_note: str | None = None


class PricingRuleChangeRequest(BaseModel):
    id: UUID
    venue_id: UUID
    pricing_rules_id: UUID | None
    proposed_by: UUID
    payload: PricingRuleCreate
    status: ChangeRequestStatus
    reviewed_by: UUID | None
    reviewed_at: datetime | None
    review_note: str | None
    created_at: datetime
    updated_at: datetime
