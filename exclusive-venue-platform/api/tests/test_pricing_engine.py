"""Unit tests for the deterministic pricing calculator (task F3).

These are synthetic scenarios, not the ">=10 real historical quotes"
tasks.md describes — converting the client's actual pricing spreadsheet
into fixtures is a human Sprint Board task (CLAUDE.md truth hierarchy),
not yet done. Each test instead pins down one calculator behavior
(base rate, tiers, overtime, day/season adjustment, addons, min_spend)
so real quotes can be dropped in as fixtures later without touching the
engine itself.
"""

from datetime import date
from uuid import uuid4

from app.schemas.pricing import PricingRule, PricingRuleAddon, QuoteRequest
from app.services.pricing_engine import calculate_quote

VENUE_ID = uuid4()
RULE_ID = uuid4()
NOW = "2026-01-01T00:00:00Z"


def make_rule(**overrides) -> PricingRule:
    base = dict(
        id=RULE_ID,
        venue_id=VENUE_ID,
        currency="HKD",
        base_rate=50000,
        per_head_tiers=[],
        duration_multipliers={},
        day_adjustments={},
        season_adjustments=[],
        min_spend=None,
        notes=None,
        effective_from=date(2026, 1, 1),
        effective_to=None,
        created_at=NOW,
        updated_at=NOW,
    )
    base.update(overrides)
    return PricingRule(**base)


def make_request(**overrides) -> QuoteRequest:
    base = dict(guest_count=100, event_date=date(2026, 6, 15), duration_hours=4, addon_ids=[])
    base.update(overrides)
    return QuoteRequest(**base)


def test_base_rate_only():
    quote = calculate_quote(make_rule(), [], make_request())
    assert quote.total == 50000


def test_per_head_tier_applies_to_matching_range():
    rule = make_rule(per_head_tiers=[
        {"min_guests": 0, "max_guests": 99, "rate_per_head": 300},
        {"min_guests": 100, "max_guests": None, "rate_per_head": 250},
    ])
    quote = calculate_quote(rule, [], make_request(guest_count=100))
    assert quote.per_head_total == 25000  # 100 * 250, the second tier
    assert quote.total == 75000


def test_per_head_tier_below_range_uses_lower_tier():
    rule = make_rule(per_head_tiers=[
        {"min_guests": 0, "max_guests": 99, "rate_per_head": 300},
        {"min_guests": 100, "max_guests": None, "rate_per_head": 250},
    ])
    quote = calculate_quote(rule, [], make_request(guest_count=80))
    assert quote.per_head_total == 24000  # 80 * 300
    assert quote.total == 74000


def test_no_matching_tier_contributes_zero():
    rule = make_rule(per_head_tiers=[{"min_guests": 200, "max_guests": None, "rate_per_head": 100}])
    quote = calculate_quote(rule, [], make_request(guest_count=50))
    assert quote.per_head_total == 0
    assert quote.total == 50000


def test_duration_within_included_hours_no_overtime():
    rule = make_rule(duration_multipliers={"included_hours": 4, "overtime_rate_per_hour": 5000})
    quote = calculate_quote(rule, [], make_request(duration_hours=4))
    assert quote.duration_overtime_amount == 0


def test_duration_overtime_charged_per_extra_hour():
    rule = make_rule(duration_multipliers={"included_hours": 4, "overtime_rate_per_hour": 5000})
    quote = calculate_quote(rule, [], make_request(duration_hours=6))
    assert quote.duration_overtime_amount == 10000
    assert quote.total == 60000


def test_day_adjustment_multiplies_subtotal():
    rule = make_rule(day_adjustments={"saturday": 1.25})
    saturday = date(2026, 6, 20)
    assert saturday.strftime("%A") == "Saturday"
    quote = calculate_quote(rule, [], make_request(event_date=saturday))
    assert quote.day_adjustment_multiplier == 1.25
    assert quote.total == 62500


def test_day_without_adjustment_defaults_to_one():
    rule = make_rule(day_adjustments={"saturday": 1.25})
    monday = date(2026, 6, 22)
    assert monday.strftime("%A") == "Monday"
    quote = calculate_quote(rule, [], make_request(event_date=monday))
    assert quote.day_adjustment_multiplier == 1.0
    assert quote.total == 50000


def test_season_adjustment_applies_within_range():
    rule = make_rule(season_adjustments=[
        {"start_date": "2026-12-01", "end_date": "2026-12-31", "multiplier": 1.3}
    ])
    quote = calculate_quote(rule, [], make_request(event_date=date(2026, 12, 24)))
    assert quote.season_adjustment_multiplier == 1.3
    assert quote.total == 65000


def test_season_adjustment_outside_range_not_applied():
    rule = make_rule(season_adjustments=[
        {"start_date": "2026-12-01", "end_date": "2026-12-31", "multiplier": 1.3}
    ])
    quote = calculate_quote(rule, [], make_request(event_date=date(2026, 6, 15)))
    assert quote.season_adjustment_multiplier == 1.0
    assert quote.total == 50000


def test_flat_addon_added_once():
    addon = PricingRuleAddon(
        id=uuid4(), pricing_rules_id=RULE_ID, name="DJ", pricing_type="flat",
        amount=8000, created_at=NOW, updated_at=NOW,
    )
    quote = calculate_quote(make_rule(), [addon], make_request(addon_ids=[addon.id]))
    assert quote.addons_total == 8000
    assert quote.total == 58000


def test_per_head_addon_scales_with_guests():
    addon = PricingRuleAddon(
        id=uuid4(), pricing_rules_id=RULE_ID, name="Extra canapé", pricing_type="per_head",
        amount=50, created_at=NOW, updated_at=NOW,
    )
    quote = calculate_quote(make_rule(), [addon], make_request(guest_count=100, addon_ids=[addon.id]))
    assert quote.addons_total == 5000


def test_per_hour_addon_scales_with_duration():
    addon = PricingRuleAddon(
        id=uuid4(), pricing_rules_id=RULE_ID, name="Extra security", pricing_type="per_hour",
        amount=1000, created_at=NOW, updated_at=NOW,
    )
    quote = calculate_quote(make_rule(), [addon], make_request(duration_hours=6, addon_ids=[addon.id]))
    assert quote.addons_total == 6000


def test_unselected_addon_not_charged():
    addon = PricingRuleAddon(
        id=uuid4(), pricing_rules_id=RULE_ID, name="DJ", pricing_type="flat",
        amount=8000, created_at=NOW, updated_at=NOW,
    )
    quote = calculate_quote(make_rule(), [addon], make_request(addon_ids=[]))
    assert quote.addons_total == 0
    assert quote.total == 50000


def test_min_spend_floors_a_low_quote():
    rule = make_rule(base_rate=10000, min_spend=40000)
    quote = calculate_quote(rule, [], make_request())
    assert quote.min_spend_applied is True
    assert quote.total == 40000


def test_min_spend_not_applied_when_quote_already_higher():
    rule = make_rule(base_rate=60000, min_spend=40000)
    quote = calculate_quote(rule, [], make_request())
    assert quote.min_spend_applied is False
    assert quote.total == 60000


def test_full_stack_reproduces_expected_total():
    """One combined scenario exercising every component at once — the
    shape a real historical-quote fixture would take once the client's
    pricing spreadsheet is converted (Sprint Board task, not this repo)."""
    rule = make_rule(
        base_rate=50000,
        per_head_tiers=[{"min_guests": 0, "max_guests": None, "rate_per_head": 200}],
        duration_multipliers={"included_hours": 4, "overtime_rate_per_hour": 5000},
        day_adjustments={"saturday": 1.2},
        season_adjustments=[{"start_date": "2026-12-01", "end_date": "2026-12-31", "multiplier": 1.1}],
        min_spend=100000,
    )
    addon = PricingRuleAddon(
        id=uuid4(), pricing_rules_id=RULE_ID, name="Florals", pricing_type="flat",
        amount=6000, created_at=NOW, updated_at=NOW,
    )
    saturday_in_december = date(2026, 12, 12)
    assert saturday_in_december.strftime("%A") == "Saturday"

    quote = calculate_quote(
        rule,
        [addon],
        make_request(
            guest_count=150, event_date=saturday_in_december, duration_hours=6, addon_ids=[addon.id]
        ),
    )

    # (50000 + 150*200) * 1.2 * 1.1 = 105600; + overtime 2h*5000=10000; + addon 6000
    assert quote.pre_adjustment_subtotal == 80000
    assert quote.adjusted_subtotal == 105600
    assert quote.duration_overtime_amount == 10000
    assert quote.addons_total == 6000
    assert quote.subtotal == 121600
    assert quote.min_spend_applied is False
    assert quote.total == 121600
