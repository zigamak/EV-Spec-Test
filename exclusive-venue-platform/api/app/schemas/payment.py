"""Validation schemas for order payments (erd.md §6b). Mirrors
migrations/versions/0036_payments.py. Fully decoupled from orders — an
order can exist with zero payment rows (pay-later/quote path).
"""

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel

PaymentStatus = Literal["pending", "succeeded", "failed", "refunded"]


class PaymentCreate(BaseModel):
    order_id: UUID
    payment_method: str = "stripe"
    amount: float
    currency: str


class Payment(BaseModel):
    id: UUID
    order_id: UUID
    payment_method: str
    stripe_payment_intent_id: str | None
    amount: float
    currency: str
    status: PaymentStatus
    paid_at: datetime | None
    created_at: datetime


class PaymentWithClientSecret(Payment):
    """Only ever returned once, at creation time — Stripe's client_secret
    is what the frontend needs to actually collect a card (stripe.js'
    confirmPayment), and isn't persisted in the payments table itself."""

    client_secret: str
