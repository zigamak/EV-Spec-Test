"""Validation schemas for vendor payouts (erd.md §6b). Mirrors
migrations/versions/0038_payouts.py.
"""

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel

PayoutMethod = Literal["manual", "stripe_connect"]
PayoutStatus = Literal["pending", "paid", "failed"]


class PayoutCreate(BaseModel):
    order_id: UUID


class Payout(BaseModel):
    id: UUID
    vendor_id: UUID
    order_id: UUID
    gross_amount: float
    commission_amount: float
    net_amount: float
    currency: str
    method: PayoutMethod
    status: PayoutStatus
    paid_at: datetime | None
    paid_by: UUID | None
    created_at: datetime
