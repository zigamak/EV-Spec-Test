"""Deterministic recommendation filter (task E1) + AI re-rank (E2).

E1 is the trust-boundary anchor for this whole engine (constitution #1):
a pure function, capacity/availability/restrictions/budget only, zero AI.
E2 may only reorder what E1 already returned — it can never add, remove,
or invent a shortlist entry (erd.md "Recommender" contract). Enforced
structurally below: rerank_shortlist takes the E1 shortlist and returns a
reordering of the *same* entries, asserting the id set is unchanged.
"""

import json
from datetime import date
from uuid import UUID

from app.core.llm import LLMCallError, LLMUnavailableError, ToolSchema, get_llm_client
from app.schemas.pricing import QuoteRequest
from app.schemas.recommendation import (
    BriefInput,
    ExclusionReason,
    ShortlistEntry,
    VenueCandidate,
    VenueOption,
)
from app.services.pricing_engine import calculate_quote

# A hard venue restriction only excludes a venue when the brief's
# requirements explicitly say the event needs the thing the restriction
# forbids — brief.requirements["needs"] is a list of these keys.
RESTRICTION_CONFLICT_KEYS = {
    "no_amplified_music": "amplified_music",
    "no_smoking": "smoking",
    "no_open_flame": "open_flame",
    "no_red_wine": "red_wine",
}

# Real quotes vs. a stated budget are never an exact match — this is the
# soft ceiling above the stated budget a venue is still shortlisted at;
# beyond it, the venue is excluded rather than merely deprioritized.
BUDGET_TOLERANCE = 0.15



def _has_overlap(event_date: date, windows: list) -> bool:
    return any(w.starts_on <= event_date <= w.ends_on for w in windows)


def _best_fit_configuration(configurations: list, guest_count: int):
    fitting = [c for c in configurations if c.capacity >= guest_count]
    if not fitting:
        return None
    return min(fitting, key=lambda c: c.capacity)


def _target_budget(brief: BriefInput) -> float | None:
    if brief.budget_amount is None:
        return None
    if brief.budget_basis == "per_head":
        return brief.budget_amount * brief.guest_count
    return brief.budget_amount


def filter_venues(
    brief: BriefInput, candidates: list[VenueCandidate]
) -> tuple[list[ShortlistEntry], list[ExclusionReason]]:
    shortlist: list[ShortlistEntry] = []
    excluded: list[ExclusionReason] = []
    target_budget = _target_budget(brief)
    needs = set(brief.requirements.get("needs", []))

    for candidate in candidates:
        if candidate.status != "active":
            excluded.append(
                ExclusionReason(venue_id=candidate.venue_id, venue_name=candidate.name, reason="not active")
            )
            continue

        if _has_overlap(brief.event_date, candidate.availability):
            excluded.append(
                ExclusionReason(
                    venue_id=candidate.venue_id, venue_name=candidate.name, reason="unavailable on that date"
                )
            )
            continue

        conflicting = [
            r for r in candidate.restrictions if r.hard and RESTRICTION_CONFLICT_KEYS.get(r.kind) in needs
        ]
        if conflicting:
            excluded.append(
                ExclusionReason(
                    venue_id=candidate.venue_id,
                    venue_name=candidate.name,
                    reason=f"hard restriction conflict: {conflicting[0].kind}",
                )
            )
            continue

        configuration = _best_fit_configuration(candidate.configurations, brief.guest_count)
        if configuration is None:
            excluded.append(
                ExclusionReason(
                    venue_id=candidate.venue_id,
                    venue_name=candidate.name,
                    reason="no configuration fits guest count",
                )
            )
            continue

        estimated_total: float | None = None
        within_budget: bool | None = None
        quote_breakdown: dict | None = None
        if candidate.pricing_rule is not None:
            quote = calculate_quote(
                candidate.pricing_rule,
                candidate.pricing_rule_addons,
                QuoteRequest(
                    guest_count=brief.guest_count,
                    event_date=brief.event_date,
                    duration_hours=brief.duration_hours,
                    addon_ids=[],
                ),
            )
            estimated_total = quote.total
            quote_breakdown = quote.model_dump(mode="json")
            if target_budget is not None:
                within_budget = quote.total <= target_budget * (1 + BUDGET_TOLERANCE)
                if not within_budget:
                    excluded.append(
                        ExclusionReason(
                            venue_id=candidate.venue_id,
                            venue_name=candidate.name,
                            reason=(
                                f"estimated total {quote.total} exceeds budget {target_budget} "
                                f"(+{BUDGET_TOLERANCE:.0%} tolerance)"
                            ),
                        )
                    )
                    continue

        shortlist.append(
            ShortlistEntry(
                venue_id=candidate.venue_id,
                venue_name=candidate.name,
                configuration_id=configuration.id,
                configuration_name=configuration.name,
                capacity=configuration.capacity,
                estimated_total=estimated_total,
                within_budget=within_budget,
                sort_order=len(shortlist),
                pricing_rules_id=candidate.pricing_rule.id if candidate.pricing_rule else None,
                quote_breakdown=quote_breakdown,
            )
        )

    return shortlist, excluded


def _quote_for(brief: BriefInput, candidate: VenueCandidate):
    """Compute a quote for a candidate that has a pricing rule, else None."""
    if candidate.pricing_rule is None:
        return None
    return calculate_quote(
        candidate.pricing_rule,
        candidate.pricing_rule_addons,
        QuoteRequest(
            guest_count=brief.guest_count,
            event_date=brief.event_date,
            duration_hours=brief.duration_hours,
            addon_ids=[],
        ),
    )


def evaluate_venues(
    brief: BriefInput, candidates: list[VenueCandidate], recommend: bool = False
) -> list[VenueOption]:
    """Curate-step evaluation (task E3): every active venue as a *selectable*
    option — fit is advisory, not a gate. Non-fitting venues keep their
    reasons (over capacity/budget, unavailable, restriction conflict) but are
    still priced and returned so an operator can pick them by judgement. Sorts
    fitting-first then by price; optionally flags AI `recommended` ones by
    description. Venues with no configuration at all are skipped (a proposal
    line needs a configuration to attach to)."""
    target_budget = _target_budget(brief)
    needs = set(brief.requirements.get("needs", []))
    options: list[VenueOption] = []

    for candidate in candidates:
        if not candidate.configurations:
            continue

        reasons: list[str] = []
        if candidate.status != "active":
            reasons.append("not active")
        if _has_overlap(brief.event_date, candidate.availability):
            reasons.append("unavailable on that date")
        conflicting = [
            r for r in candidate.restrictions if r.hard and RESTRICTION_CONFLICT_KEYS.get(r.kind) in needs
        ]
        if conflicting:
            reasons.append(f"hard restriction: {conflicting[0].kind}")

        # Prefer the smallest configuration that fits; if none fit, fall back
        # to the largest so the venue is still priceable and selectable.
        configuration = _best_fit_configuration(candidate.configurations, brief.guest_count)
        if configuration is None:
            reasons.append("over capacity")
            configuration = max(candidate.configurations, key=lambda c: c.capacity)

        quote = _quote_for(brief, candidate)
        estimated_total = quote.total if quote else None
        quote_breakdown = quote.model_dump(mode="json") if quote else None
        within_budget: bool | None = None
        if quote is None:
            reasons.append("no pricing rule set")
        elif target_budget is not None:
            within_budget = quote.total <= target_budget * (1 + BUDGET_TOLERANCE)
            if not within_budget:
                reasons.append("over budget")

        options.append(
            VenueOption(
                venue_id=candidate.venue_id,
                venue_name=candidate.name,
                configuration_id=configuration.id,
                configuration_name=configuration.name,
                capacity=configuration.capacity,
                fits=len(reasons) == 0,
                fit_reasons=reasons,
                estimated_total=estimated_total,
                within_budget=within_budget,
                pricing_rules_id=candidate.pricing_rule.id if candidate.pricing_rule else None,
                quote_breakdown=quote_breakdown,
            )
        )

    # Fitting first, then cheapest first (unpriced last).
    options.sort(key=lambda o: (not o.fits, o.estimated_total is None, o.estimated_total or 0))
    for i, option in enumerate(options):
        option.sort_order = i

    if recommend:
        _apply_ai_recommendation(brief, candidates, options)
    return options


RECOMMEND_TOOL = ToolSchema(
    name="recommend_venues",
    description=(
        "From the given venues, choose the 1-2 that best match the client's brief and mood, "
        "judging by each venue's description. Only choose from the provided venue_ids."
    ),
    parameters={
        "type": "object",
        "properties": {
            "recommended_venue_ids": {
                "type": "array",
                "items": {"type": "string"},
                "description": "The venue_ids you recommend (1-2), a subset of those given.",
            }
        },
        "required": ["recommended_venue_ids"],
    },
)


def _apply_ai_recommendation(
    brief: BriefInput, candidates: list[VenueCandidate], options: list[VenueOption]
) -> None:
    """Flag AI-recommended options by *description* (task E3). Only the fitting
    options are eligible; fail-soft — an AI outage just means no recommendation
    badge, never a broken curate step (constitution #1: advisory only)."""
    fitting = [o for o in options if o.fits]
    if len(fitting) <= 1:
        for option in fitting:
            option.recommended = True
        return

    description_by_id = {str(c.venue_id): c.description for c in candidates}
    prompt = json.dumps(
        {
            "soft_requirements": brief.requirements,
            "guest_count": brief.guest_count,
            "venues": [
                {
                    "venue_id": str(o.venue_id),
                    "name": o.venue_name,
                    "description": description_by_id.get(str(o.venue_id)),
                }
                for o in fitting
            ],
        }
    )
    try:
        arguments = get_llm_client().call_tool(prompt, RECOMMEND_TOOL)
    except (LLMUnavailableError, LLMCallError):
        return
    recommended_ids = {str(v) for v in arguments.get("recommended_venue_ids", [])}
    for option in options:
        if str(option.venue_id) in recommended_ids:
            option.recommended = True


RERANK_TOOL = ToolSchema(
    name="reorder_shortlist",
    description=(
        "Reorder a venue shortlist by fit against the client's soft criteria. "
        "You may ONLY reorder the given venue_ids — never add, remove, or invent one."
    ),
    parameters={
        "type": "object",
        "properties": {
            "ordered_venue_ids": {
                "type": "array",
                "items": {"type": "string"},
                "description": "All input venue_ids, reordered best-fit first.",
            }
        },
        "required": ["ordered_venue_ids"],
    },
)


def rerank_shortlist(brief: BriefInput, shortlist: list[ShortlistEntry]) -> list[ShortlistEntry]:
    """AI re-rank (task E2). Structurally cannot add/remove entries:
    any id the model returns that wasn't in the input, or any input id it
    drops, is rejected and the original (E1) order is returned untouched
    rather than silently trusting a malformed reorder."""
    if len(shortlist) <= 1:
        return shortlist

    prompt = json.dumps(
        {
            "soft_requirements": brief.requirements,
            "shortlist": [
                {
                    "venue_id": str(e.venue_id),
                    "venue_name": e.venue_name,
                    "configuration_name": e.configuration_name,
                    "capacity": e.capacity,
                    "estimated_total": e.estimated_total,
                }
                for e in shortlist
            ],
        }
    )
    arguments = get_llm_client().call_tool(prompt, RERANK_TOOL)
    ordered_ids = [UUID(v) for v in arguments["ordered_venue_ids"]]

    original_ids = {e.venue_id for e in shortlist}
    if set(ordered_ids) != original_ids:
        return shortlist  # malformed reorder — fall back to E1's order, don't trust it

    by_id = {e.venue_id: e for e in shortlist}
    return [
        by_id[vid].model_copy(update={"sort_order": i}) for i, vid in enumerate(ordered_ids)
    ]
