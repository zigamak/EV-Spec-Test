"""Deterministic pricing calculator (task F2). Zero AI calls anywhere in
this module — pricing is one of the constitution's #1 deterministic-only
domains. Pure function: (pricing rule row × addon rows × quote request) ->
QuoteBreakdown. No DB access, no side effects — callers (the API router)
fetch the rows and pass them in, which is what makes this independently
unit-testable against real historical quotes (F3).

jsonb shapes this function expects (F1's schema comment documents the
"why jsonb" choice; this documents the "what's inside"):
  per_head_tiers: [{"min_guests": int, "max_guests": int|null, "rate_per_head": number}, ...]
    — the single tier whose range contains guest_count applies (not cumulative).
  duration_multipliers: {"included_hours": number, "overtime_rate_per_hour": number}
    — hours beyond included_hours are charged at overtime_rate_per_hour each.
  day_adjustments: {"monday": 1.0, ..., "saturday": 1.25, ...} — keyed by
    lowercase weekday name; a day with no entry gets multiplier 1.0.
  season_adjustments: [{"start_date": "YYYY-MM-DD", "end_date": "YYYY-MM-DD",
    "multiplier": number}, ...] — every matching range applies multiplicatively.
"""

from datetime import date

from app.schemas.pricing import PricingRule, PricingRuleAddon, QuoteBreakdown, QuoteRequest


def _per_head_rate(tiers: list[dict], guest_count: int) -> float:
    for tier in tiers:
        min_guests = tier.get("min_guests", 0)
        max_guests = tier.get("max_guests")
        if guest_count >= min_guests and (max_guests is None or guest_count <= max_guests):
            return float(tier.get("rate_per_head", 0))
    return 0.0


def _day_multiplier(day_adjustments: dict[str, float], event_date: date) -> float:
    weekday_name = event_date.strftime("%A").lower()
    return float(day_adjustments.get(weekday_name, 1.0))


def _season_multiplier(season_adjustments: list[dict], event_date: date) -> float:
    multiplier = 1.0
    for window in season_adjustments:
        start = date.fromisoformat(window["start_date"])
        end = date.fromisoformat(window["end_date"])
        if start <= event_date <= end:
            multiplier *= float(window.get("multiplier", 1.0))
    return multiplier


def _addon_amount(addon: PricingRuleAddon, guest_count: int, duration_hours: float) -> float:
    if addon.pricing_type == "flat":
        return addon.amount
    if addon.pricing_type == "per_head":
        return addon.amount * guest_count
    if addon.pricing_type == "per_hour":
        return addon.amount * duration_hours
    raise ValueError(f"Unknown addon pricing_type: {addon.pricing_type}")


def calculate_quote(
    rule: PricingRule,
    addons: list[PricingRuleAddon],
    request: QuoteRequest,
) -> QuoteBreakdown:
    per_head_total = round(_per_head_rate(rule.per_head_tiers, request.guest_count) * request.guest_count, 2)
    pre_adjustment_subtotal = round(rule.base_rate + per_head_total, 2)

    day_multiplier = _day_multiplier(rule.day_adjustments, request.event_date)
    season_multiplier = _season_multiplier(rule.season_adjustments, request.event_date)
    adjusted_subtotal = round(pre_adjustment_subtotal * day_multiplier * season_multiplier, 2)

    included_hours = float(rule.duration_multipliers.get("included_hours", request.duration_hours))
    overtime_rate = float(rule.duration_multipliers.get("overtime_rate_per_hour", 0))
    overtime_hours = max(0.0, request.duration_hours - included_hours)
    duration_overtime_amount = round(overtime_hours * overtime_rate, 2)

    selected_addons = [a for a in addons if a.id in request.addon_ids]
    addon_breakdown = [
        {
            "id": str(a.id),
            "name": a.name,
            "pricing_type": a.pricing_type,
            "amount": _addon_amount(a, request.guest_count, request.duration_hours),
        }
        for a in selected_addons
    ]
    addons_total = round(sum(a["amount"] for a in addon_breakdown), 2)

    subtotal = round(adjusted_subtotal + duration_overtime_amount + addons_total, 2)
    min_spend_applied = rule.min_spend is not None and subtotal < rule.min_spend
    total = round(rule.min_spend, 2) if min_spend_applied else subtotal

    return QuoteBreakdown(
        currency=rule.currency,
        base_rate=rule.base_rate,
        per_head_total=per_head_total,
        day_adjustment_multiplier=day_multiplier,
        season_adjustment_multiplier=season_multiplier,
        pre_adjustment_subtotal=pre_adjustment_subtotal,
        adjusted_subtotal=adjusted_subtotal,
        duration_overtime_amount=duration_overtime_amount,
        addons_total=addons_total,
        addons=addon_breakdown,
        subtotal=subtotal,
        min_spend_applied=min_spend_applied,
        total=total,
        pricing_rules_id=rule.id,
    )
