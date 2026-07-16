"""Unit tests for the deterministic recommendation filter (task E1). Pure
function, no DB/Claude involved — E2's rerank is a thin, structurally-
constrained layer on top and isn't exercised here (it needs a live
Claude call to test meaningfully; the "can't add/remove entries" guarantee
is the part worth unit testing, done in test_rerank_never_changes_membership).
"""

from datetime import date
from uuid import uuid4

from app.schemas.pricing import PricingRule
from app.schemas.recommendation import (
    AvailabilityWindow,
    BriefInput,
    ConfigurationCandidate,
    RestrictionCandidate,
    ShortlistEntry,
    VenueCandidate,
)
from app.services.recommendation_engine import filter_venues, rerank_shortlist

NOW = "2026-01-01T00:00:00Z"


def make_brief(**overrides) -> BriefInput:
    base = dict(
        guest_count=100,
        event_date=date(2026, 6, 15),
        duration_hours=4,
        budget_amount=None,
        budget_basis=None,
        requirements={},
    )
    base.update(overrides)
    return BriefInput(**base)


def make_venue(**overrides) -> VenueCandidate:
    base = dict(
        venue_id=uuid4(),
        name="Test Venue",
        status="active",
        configurations=[ConfigurationCandidate(id=uuid4(), name="Main Hall", capacity=150)],
        restrictions=[],
        availability=[],
        pricing_rule=None,
        pricing_rule_addons=[],
    )
    base.update(overrides)
    return VenueCandidate(**base)


def test_venue_with_fitting_capacity_is_shortlisted():
    shortlist, excluded = filter_venues(make_brief(guest_count=100), [make_venue()])
    assert len(shortlist) == 1
    assert excluded == []
    assert shortlist[0].capacity == 150


def test_venue_too_small_is_excluded():
    venue = make_venue(configurations=[ConfigurationCandidate(id=uuid4(), name="Small Room", capacity=50)])
    shortlist, excluded = filter_venues(make_brief(guest_count=100), [venue])
    assert shortlist == []
    assert "no configuration fits" in excluded[0].reason


def test_best_fit_picks_smallest_sufficient_configuration():
    venue = make_venue(
        configurations=[
            ConfigurationCandidate(id=uuid4(), name="Huge Hall", capacity=500),
            ConfigurationCandidate(id=uuid4(), name="Right-sized Room", capacity=120),
        ]
    )
    shortlist, _ = filter_venues(make_brief(guest_count=100), [venue])
    assert shortlist[0].configuration_name == "Right-sized Room"


def test_inactive_venue_is_excluded():
    venue = make_venue(status="pending_approval")
    shortlist, excluded = filter_venues(make_brief(), [venue])
    assert shortlist == []
    assert excluded[0].reason == "not active"


def test_overlapping_availability_excludes_venue():
    venue = make_venue(
        availability=[AvailabilityWindow(starts_on=date(2026, 6, 10), ends_on=date(2026, 6, 20))]
    )
    shortlist, excluded = filter_venues(make_brief(event_date=date(2026, 6, 15)), [venue])
    assert shortlist == []
    assert "unavailable" in excluded[0].reason


def test_availability_outside_window_does_not_exclude():
    venue = make_venue(
        availability=[AvailabilityWindow(starts_on=date(2026, 7, 1), ends_on=date(2026, 7, 5))]
    )
    shortlist, _ = filter_venues(make_brief(event_date=date(2026, 6, 15)), [venue])
    assert len(shortlist) == 1


def test_hard_restriction_conflict_excludes_venue():
    venue = make_venue(restrictions=[RestrictionCandidate(kind="no_amplified_music", hard=True)])
    brief = make_brief(requirements={"needs": ["amplified_music"]})
    shortlist, excluded = filter_venues(brief, [venue])
    assert shortlist == []
    assert "no_amplified_music" in excluded[0].reason


def test_soft_restriction_does_not_exclude():
    venue = make_venue(restrictions=[RestrictionCandidate(kind="no_amplified_music", hard=False)])
    brief = make_brief(requirements={"needs": ["amplified_music"]})
    shortlist, _ = filter_venues(brief, [venue])
    assert len(shortlist) == 1


def test_restriction_with_no_conflicting_need_does_not_exclude():
    venue = make_venue(restrictions=[RestrictionCandidate(kind="no_smoking", hard=True)])
    brief = make_brief(requirements={"needs": ["amplified_music"]})
    shortlist, _ = filter_venues(brief, [venue])
    assert len(shortlist) == 1


def test_shortlist_entry_carries_pricing_rules_id_and_breakdown_for_proposal_creation():
    rule = PricingRule(
        id=uuid4(), venue_id=uuid4(), currency="HKD", base_rate=50000, per_head_tiers=[],
        duration_multipliers={}, day_adjustments={}, season_adjustments=[], min_spend=None,
        notes=None, effective_from=date(2026, 1, 1), effective_to=None, created_at=NOW, updated_at=NOW,
    )
    venue = make_venue(pricing_rule=rule)
    shortlist, _ = filter_venues(make_brief(), [venue])
    assert shortlist[0].pricing_rules_id == rule.id
    assert shortlist[0].quote_breakdown is not None
    assert shortlist[0].quote_breakdown["total"] == 50000


def test_shortlist_entry_has_no_pricing_rules_id_without_a_rule():
    venue = make_venue(pricing_rule=None)
    shortlist, _ = filter_venues(make_brief(), [venue])
    assert shortlist[0].pricing_rules_id is None
    assert shortlist[0].quote_breakdown is None


def test_within_budget_is_shortlisted_with_estimated_total():
    rule = PricingRule(
        id=uuid4(), venue_id=uuid4(), currency="HKD", base_rate=50000, per_head_tiers=[],
        duration_multipliers={}, day_adjustments={}, season_adjustments=[], min_spend=None,
        notes=None, effective_from=date(2026, 1, 1), effective_to=None, created_at=NOW, updated_at=NOW,
    )
    venue = make_venue(pricing_rule=rule)
    brief = make_brief(budget_amount=100000, budget_basis="total")
    shortlist, excluded = filter_venues(brief, [venue])
    assert len(shortlist) == 1
    assert shortlist[0].estimated_total == 50000
    assert shortlist[0].within_budget is True
    assert excluded == []


def test_over_budget_beyond_tolerance_is_excluded():
    rule = PricingRule(
        id=uuid4(), venue_id=uuid4(), currency="HKD", base_rate=200000, per_head_tiers=[],
        duration_multipliers={}, day_adjustments={}, season_adjustments=[], min_spend=None,
        notes=None, effective_from=date(2026, 1, 1), effective_to=None, created_at=NOW, updated_at=NOW,
    )
    venue = make_venue(pricing_rule=rule)
    brief = make_brief(budget_amount=100000, budget_basis="total")
    shortlist, excluded = filter_venues(brief, [venue])
    assert shortlist == []
    assert "exceeds budget" in excluded[0].reason


def test_slightly_over_budget_within_tolerance_is_shortlisted():
    # 15% tolerance: a 105000 quote against a 100000 budget should pass.
    rule = PricingRule(
        id=uuid4(), venue_id=uuid4(), currency="HKD", base_rate=105000, per_head_tiers=[],
        duration_multipliers={}, day_adjustments={}, season_adjustments=[], min_spend=None,
        notes=None, effective_from=date(2026, 1, 1), effective_to=None, created_at=NOW, updated_at=NOW,
    )
    venue = make_venue(pricing_rule=rule)
    brief = make_brief(budget_amount=100000, budget_basis="total")
    shortlist, _ = filter_venues(brief, [venue])
    assert len(shortlist) == 1
    assert shortlist[0].within_budget is True


def test_per_head_budget_basis_is_normalized_against_guest_count():
    rule = PricingRule(
        id=uuid4(), venue_id=uuid4(), currency="HKD", base_rate=40000, per_head_tiers=[],
        duration_multipliers={}, day_adjustments={}, season_adjustments=[], min_spend=None,
        notes=None, effective_from=date(2026, 1, 1), effective_to=None, created_at=NOW, updated_at=NOW,
    )
    venue = make_venue(pricing_rule=rule)
    # 100 guests * HK$500/head = 50000 target budget; a 40000 quote fits.
    brief = make_brief(guest_count=100, budget_amount=500, budget_basis="per_head")
    shortlist, _ = filter_venues(brief, [venue])
    assert len(shortlist) == 1
    assert shortlist[0].within_budget is True


def test_no_pricing_rule_skips_budget_filtering_without_excluding():
    venue = make_venue(pricing_rule=None)
    brief = make_brief(budget_amount=1, budget_basis="total")
    shortlist, excluded = filter_venues(brief, [venue])
    assert len(shortlist) == 1
    assert shortlist[0].estimated_total is None
    assert shortlist[0].within_budget is None
    assert excluded == []


def test_sort_order_follows_shortlist_position():
    venues = [make_venue(name=f"Venue {i}") for i in range(3)]
    shortlist, _ = filter_venues(make_brief(), venues)
    assert [e.sort_order for e in shortlist] == [0, 1, 2]


def test_rerank_never_changes_membership_on_malformed_response(monkeypatch):
    """E2's contract: if the model's reorder doesn't contain exactly the
    input venue_ids, fall back to E1's original order rather than trust
    a malformed response. Simulated here without a live AI call — mocks
    at the provider-agnostic app.core.llm boundary, not any specific
    provider's SDK shape."""
    import app.services.recommendation_engine as engine

    class FakeClient:
        def call_tool(self, prompt, tool):
            return {"ordered_venue_ids": [str(uuid4())]}  # bogus id, not in the shortlist

    monkeypatch.setattr(engine, "get_llm_client", lambda: FakeClient())

    entries = [
        ShortlistEntry(
            venue_id=uuid4(), venue_name="A", configuration_id=uuid4(), configuration_name="Hall",
            capacity=100, estimated_total=None, within_budget=None, sort_order=0,
        ),
        ShortlistEntry(
            venue_id=uuid4(), venue_name="B", configuration_id=uuid4(), configuration_name="Hall",
            capacity=100, estimated_total=None, within_budget=None, sort_order=1,
        ),
    ]
    result = rerank_shortlist(make_brief(), entries)
    assert [e.venue_id for e in result] == [e.venue_id for e in entries]
