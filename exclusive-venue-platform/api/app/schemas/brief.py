"""Validation schemas for the brief parser domain (erd.md §5.1, task D1,
standardized 18 Jul — task D5). Mirrors migrations/versions/0004_briefs.py
as revised by 0008_brief_standardization.py.

The point of the 18 Jul revision: one standard brief contract regardless
of which channel the enquiry came in on (email, WhatsApp, a manual staff
note) or whether it was filled by the AI parser at all — a public web-form
submission (C2, not yet built) fills these same fields directly and
deterministically, no free-text parsing involved, landing at
confidence=1.0 / review_status='human_approved'.

`requirements` stays a free-form jsonb column (unchanged since 0004) but
now has a documented conventional shape rather than being genuinely
arbitrary, so the UI can render it predictably:

    {
        "format_needs": ["panel", "certificate", "f&b"],
        "tech_needs": ["branded_backdrop", "av"],
        "mood": ["considered", "light", "sense of arrival"],
        "attachments": [{"name": "moodboard.pdf", "url": "..."}]
    }

None of those four keys are enforced by a DB CHECK — same reasoning as
pricing_rules' jsonb tiers (erd.md §4): validated in code, not the
database, so a genuinely unusual enquiry can still carry an extra key
without a migration.
"""

from datetime import date, datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field, model_validator

BudgetBasis = Literal["total", "per_head"]
BudgetStatus = Literal["confirmed", "tbc", "unspecified"]
ReviewStatus = Literal["auto_accepted", "needs_review", "human_approved", "human_corrected"]
TimeOfDay = Literal["morning", "afternoon", "evening", "full_day"]

# Conventional (not enforced) keys inside the `requirements` jsonb blob —
# see module docstring. Exported so brief_parser.py's tool schema and any
# future UI code share one spelling instead of drifting.
REQUIREMENTS_CONVENTIONAL_KEYS = ("format_needs", "tech_needs", "mood", "attachments")


class ParsedBrief(BaseModel):
    """GPT tool-calling output (app/services/brief_parser.py), validated
    before it ever reaches the DB — nothing AI-produced is authoritative
    until it passes this schema (constitution #1)."""

    date_window_start: date | None = None
    date_window_end: date | None = None
    date_suggestions: list[date] = Field(default_factory=list)
    event_date_flexible: bool = False
    guest_count: int | None = Field(default=None, gt=0)
    event_type: str | None = None
    duration_hours: float | None = Field(default=None, gt=0)
    time_of_day: TimeOfDay | None = None
    budget_amount: float | None = Field(default=None, ge=0)
    budget_basis: BudgetBasis | None = None
    budget_status: BudgetStatus = "unspecified"
    budget_estimate_low: float | None = Field(default=None, ge=0)
    budget_estimate_high: float | None = Field(default=None, ge=0)
    location_preference: str | None = None
    catering: str | None = None
    decision_by: date | None = None
    requirements: dict[str, Any] = Field(default_factory=dict)
    confidence: float = Field(ge=0, le=1)
    flagged_fields: list[str] = Field(default_factory=list)
    fields_to_confirm: list[str] = Field(default_factory=list)
    contact_hint: dict[str, str | None] = Field(default_factory=dict)

    @model_validator(mode="after")
    def _window_order(self) -> "ParsedBrief":
        if (
            self.date_window_start is not None
            and self.date_window_end is not None
            and self.date_window_end < self.date_window_start
        ):
            raise ValueError("date_window_end cannot be before date_window_start")
        return self

    @model_validator(mode="after")
    def _budget_estimate_range(self) -> "ParsedBrief":
        low, high = self.budget_estimate_low, self.budget_estimate_high
        if (low is None) != (high is None):
            raise ValueError("budget_estimate_low and budget_estimate_high must both be set or both be null")
        if low is not None and high is not None and high < low:
            raise ValueError("budget_estimate_high cannot be less than budget_estimate_low")
        return self


class BriefUpdate(BaseModel):
    date_window_start: date | None = None
    date_window_end: date | None = None
    date_suggestions: list[date] | None = None
    event_date_flexible: bool | None = None
    guest_count: int | None = Field(default=None, gt=0)
    event_type: str | None = None
    duration_hours: float | None = Field(default=None, gt=0)
    time_of_day: TimeOfDay | None = None
    budget_amount: float | None = Field(default=None, ge=0)
    budget_basis: BudgetBasis | None = None
    budget_status: BudgetStatus | None = None
    budget_estimate_low: float | None = Field(default=None, ge=0)
    budget_estimate_high: float | None = Field(default=None, ge=0)
    location_preference: str | None = None
    catering: str | None = None
    decision_by: date | None = None
    requirements: dict[str, Any] | None = None
    flagged_fields: list[str] | None = None
    fields_to_confirm: list[str] | None = None
    review_status: ReviewStatus | None = None


class Brief(BaseModel):
    id: UUID
    enquiry_id: UUID
    version: int
    date_window_start: date | None
    date_window_end: date | None
    date_suggestions: list[date]
    event_date_flexible: bool
    guest_count: int | None
    event_type: str | None
    duration_hours: float | None
    time_of_day: TimeOfDay | None
    budget_amount: float | None
    budget_basis: BudgetBasis | None
    budget_status: BudgetStatus
    budget_estimate_low: float | None
    budget_estimate_high: float | None
    location_preference: str | None
    catering: str | None
    decision_by: date | None
    requirements: dict[str, Any]
    confidence: float
    flagged_fields: list[str]
    fields_to_confirm: list[str]
    review_status: ReviewStatus
    reviewed_by: UUID | None
    parser_model: str | None
    created_at: datetime
    updated_at: datetime
