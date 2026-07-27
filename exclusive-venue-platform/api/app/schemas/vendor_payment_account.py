"""Validation schemas for vendor payout accounts (erd.md §6b). Mirrors
migrations/versions/0037_vendor_payment_accounts.py and (closely)
app/schemas/landlord_payment_account.py — payout_method is a per-vendor
setting, not a build-time choice (Stripe Connect Express isn't self-serve
everywhere, per the Product 3 Thailand research).
"""

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel

PayoutMethod = Literal["manual", "stripe_connect"]
VendorPaymentAccountStatus = Literal[
    "not_started", "pending_verification", "verified", "active", "restricted"
]


class VendorPaymentAccountUpsert(BaseModel):
    payout_method: PayoutMethod = "manual"
    stripe_connect_account_id: str | None = None
    bank_name: str | None = None
    account_holder_name: str | None = None
    account_number: str | None = None
    swift_bic: str | None = None
    currency: str


class VendorPaymentAccount(BaseModel):
    id: UUID
    vendor_id: UUID
    payout_method: PayoutMethod
    stripe_connect_account_id: str | None
    bank_name: str | None
    account_holder_name: str | None
    account_number: str | None
    swift_bic: str | None
    currency: str
    status: VendorPaymentAccountStatus
    created_at: datetime
    updated_at: datetime
