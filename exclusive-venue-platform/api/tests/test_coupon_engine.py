"""Unit tests for calculate_discount, the pure half of the coupon engine
(erd.md §6b). validate_and_apply_coupon needs a real Supabase client and
is covered by the same live-verification caveat as the rest of Product 4.
"""

from app.services.coupon_engine import calculate_discount


def test_percentage_discount():
    coupon = {"discount_type": "percentage", "discount_value": 10}
    assert calculate_discount(1000, coupon) == 100


def test_flat_discount():
    coupon = {"discount_type": "flat", "discount_value": 50}
    assert calculate_discount(1000, coupon) == 50


def test_flat_discount_never_exceeds_subtotal():
    coupon = {"discount_type": "flat", "discount_value": 500}
    assert calculate_discount(100, coupon) == 100


def test_percentage_over_hundred_capped_at_subtotal():
    # Defensive: a percentage_rate is DB-constrained to <= 100 for
    # commission_rules but coupons.discount_value has no such CHECK — the
    # engine itself must not let a coupon result in a negative total.
    coupon = {"discount_type": "percentage", "discount_value": 150}
    assert calculate_discount(200, coupon) == 200
