"""Validation schemas for marketplace orders (erd.md §6b). Mirrors
migrations/versions/0035_orders.py. Guest checkout by default — contact
fields, not a contact_id, since the orderer usually has no account yet
(same shape as enquiry intake).
"""

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

OrderStatus = Literal["pending", "confirmed", "completed", "canceled", "refunded"]


class OrderCreate(BaseModel):
    full_name: str = Field(min_length=1)
    email: str = Field(min_length=3)
    phone: str | None = None
    vendor_id: UUID
    vendor_service_id: UUID | None = None
    event_date: str | None = None
    guest_count: int | None = Field(default=None, gt=0)
    coupon_code: str | None = None
    customer_user_id: UUID | None = None


class OrderStatusUpdate(BaseModel):
    status: OrderStatus


class OrderQuoteUpdate(BaseModel):
    """Vendor sets a price on a quote-request order (vendor_service_id was
    null or pointed at a pricing_type='quote' service, so subtotal_amount
    started at 0)."""

    subtotal_amount: float = Field(ge=0)


class Order(BaseModel):
    id: UUID
    contact_id: UUID
    customer_user_id: UUID | None
    vendor_id: UUID
    vendor_service_id: UUID | None
    event_date: str | None
    guest_count: int | None
    subtotal_amount: float
    coupon_id: UUID | None
    discount_amount: float
    total_amount: float
    currency: str
    commission_rules_id: UUID
    commission_amount: float
    payout_amount: float
    status: OrderStatus
    created_at: datetime
    updated_at: datetime
