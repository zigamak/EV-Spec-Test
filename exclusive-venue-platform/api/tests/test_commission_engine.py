"""Unit tests for the deterministic commission calculator (erd.md §6b).
Only calculate_commission is tested here — it's the pure half;
find_active_commission_rule needs a real Supabase client and is covered
by the same live-verification caveat as the rest of Product 4 (see
specs/0004-vendor-marketplace/plan.md §5).
"""

from app.services.commission_engine import calculate_commission


def test_percentage_only():
    rule = {"percentage_rate": 15, "fixed_fee": 0}
    commission, payout = calculate_commission(1000, rule)
    assert commission == 150
    assert payout == 850


def test_percentage_plus_fixed_fee():
    rule = {"percentage_rate": 10, "fixed_fee": 20}
    commission, payout = calculate_commission(1000, rule)
    assert commission == 120
    assert payout == 880


def test_commission_never_exceeds_subtotal():
    # A pathological rule (high fixed fee on a tiny order) must not
    # produce a negative payout.
    rule = {"percentage_rate": 15, "fixed_fee": 500}
    commission, payout = calculate_commission(100, rule)
    assert commission == 100
    assert payout == 0


def test_zero_rate():
    rule = {"percentage_rate": 0, "fixed_fee": 0}
    commission, payout = calculate_commission(500, rule)
    assert commission == 0
    assert payout == 500
