"""Validation schemas for coupons (erd.md §6b). Mirrors
migrations/versions/0034_coupons.py. Same "platform default vs vendor
override" ownership shape as commission_rules.
"""

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, model_validator

DiscountType = Literal["percentage", "flat"]
CouponStatus = Literal["active", "expired", "disabled"]


class CouponCreate(BaseModel):
    code: str = Field(min_length=1)
    vendor_id: UUID | None = None
    discount_type: DiscountType
    discount_value: float = Field(ge=0)
    currency: str | None = None
    min_order_amount: float | None = Field(default=None, ge=0)
    max_uses: int | None = Field(default=None, gt=0)
    valid_to: datetime | None = None

    @model_validator(mode="after")
    def _currency_matches_discount_type(self) -> "CouponCreate":
        if self.discount_type == "flat" and self.currency is None:
            raise ValueError("currency is required when discount_type='flat'")
        if self.discount_type == "percentage" and self.currency is not None:
            raise ValueError("currency must be omitted when discount_type='percentage'")
        return self


class Coupon(BaseModel):
    id: UUID
    code: str
    vendor_id: UUID | None
    discount_type: DiscountType
    discount_value: float
    currency: str | None
    min_order_amount: float | None
    max_uses: int | None
    uses_count: int
    valid_from: datetime
    valid_to: datetime | None
    status: CouponStatus
    created_by: UUID
    created_at: datetime
    updated_at: datetime
