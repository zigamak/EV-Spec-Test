"""Deterministic coupon validation (erd.md §6b) — zero AI, same trust
boundary as pricing_engine.py. Split into a pure `calculate_discount`
(unit-tested without a DB) and a lookup half that needs a real Supabase
client, same pattern as commission_engine.py.
"""

from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from supabase import Client


class CouponError(Exception):
    """Raised for any reason a coupon can't be applied — the caller (the
    orders router) turns this into a 400, never a silent no-op discount."""


def calculate_discount(subtotal: float, coupon: dict[str, Any]) -> float:
    if coupon["discount_type"] == "percentage":
        discount = subtotal * (coupon["discount_value"] / 100)
    else:
        discount = coupon["discount_value"]
    return round(min(discount, subtotal), 2)  # never discounts below zero


def validate_and_apply_coupon(
    client: "Client", code: str, vendor_id: str, subtotal: float
) -> tuple[dict[str, Any], float]:
    """Returns (coupon_row, discount_amount) or raises CouponError. Only
    ever called server-side (never a direct anon SELECT on coupons,
    rls-matrix.md hard line) — this IS the "RPC" erd.md §6b refers to."""
    rows = (
        client.table("coupons")
        .select("*")
        .eq("code", code)
        .or_(f"vendor_id.is.null,vendor_id.eq.{vendor_id}")
        .execute()
        .data
    )
    if not rows:
        raise CouponError("Invalid coupon code")
    coupon = rows[0]

    if coupon["status"] != "active":
        raise CouponError("Coupon is not active")

    now = datetime.now(UTC).isoformat()
    if coupon["valid_from"] > now:
        raise CouponError("Coupon is not yet valid")
    if coupon["valid_to"] is not None and coupon["valid_to"] < now:
        raise CouponError("Coupon has expired")

    if coupon["max_uses"] is not None and coupon["uses_count"] >= coupon["max_uses"]:
        raise CouponError("Coupon has reached its usage limit")

    if coupon["min_order_amount"] is not None and subtotal < coupon["min_order_amount"]:
        raise CouponError(f"Order must be at least {coupon['min_order_amount']} to use this coupon")

    return coupon, calculate_discount(subtotal, coupon)
