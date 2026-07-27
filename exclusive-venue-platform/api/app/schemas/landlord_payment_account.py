"""Validation schemas for landlord payout accounts (erd.md §6a, task C1).
Mirrors migrations/versions/0027_landlord_payment_accounts.py.
"""

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel

PaymentAccountStatus = Literal["pending_verification", "verified"]


class LandlordPaymentAccountUpsert(BaseModel):
    bank_name: str | None = None
    account_holder_name: str | None = None
    account_number: str | None = None
    swift_bic: str | None = None
    currency: str


class LandlordPaymentAccount(BaseModel):
    id: UUID
    landlord_id: UUID
    bank_name: str | None
    account_holder_name: str | None
    account_number: str | None
    swift_bic: str | None
    currency: str
    status: PaymentAccountStatus
    created_at: datetime
    updated_at: datetime


def mask_account_number(account: dict) -> dict:
    """Last-4-only view — used whenever the caller isn't looking at their
    own record (e.g. staff browsing landlord accounts). erd.md §6a: this
    table holds real bank data, unlike a Stripe-backed version where
    Stripe would hold it instead."""
    masked = dict(account)
    number = masked.get("account_number")
    if number and len(number) > 4:
        masked["account_number"] = f"****{number[-4:]}"
    return masked
