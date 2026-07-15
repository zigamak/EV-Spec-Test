"""Validation schemas for the brief parser domain (erd.md §5, task D1).
Mirrors migrations/versions/0004_briefs.py.
"""

from datetime import date, datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field

BudgetBasis = Literal["total", "per_head"]
ReviewStatus = Literal["auto_accepted", "needs_review", "human_approved", "human_corrected"]


class ParsedBrief(BaseModel):
    """GPT tool-calling output (app/services/brief_parser.py), validated
    before it ever reaches the DB — nothing AI-produced is authoritative
    until it passes this schema (constitution #1)."""

    event_date: date | None = None
    event_date_flexible: bool = False
    guest_count: int | None = Field(default=None, gt=0)
    event_type: str | None = None
    budget_amount: float | None = Field(default=None, ge=0)
    budget_basis: BudgetBasis | None = None
    duration_hours: float | None = Field(default=None, gt=0)
    location_preference: str | None = None
    requirements: dict[str, Any] = Field(default_factory=dict)
    confidence: float = Field(ge=0, le=1)
    contact_hint: dict[str, str | None] = Field(default_factory=dict)


class BriefUpdate(BaseModel):
    event_date: date | None = None
    event_date_flexible: bool | None = None
    guest_count: int | None = Field(default=None, gt=0)
    event_type: str | None = None
    budget_amount: float | None = Field(default=None, ge=0)
    budget_basis: BudgetBasis | None = None
    duration_hours: float | None = Field(default=None, gt=0)
    location_preference: str | None = None
    requirements: dict[str, Any] | None = None
    review_status: ReviewStatus | None = None


class Brief(BaseModel):
    id: UUID
    enquiry_id: UUID
    version: int
    event_date: date | None
    event_date_flexible: bool
    guest_count: int | None
    event_type: str | None
    budget_amount: float | None
    budget_basis: BudgetBasis | None
    duration_hours: float | None
    location_preference: str | None
    requirements: dict[str, Any]
    confidence: float
    review_status: ReviewStatus
    reviewed_by: UUID | None
    parser_model: str | None
    created_at: datetime
    updated_at: datetime
