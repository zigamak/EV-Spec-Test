"""Deterministic recommendation filter (task E1) + GPT re-rank (E2).

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

from app.core.openai_client import get_openai_client
from app.schemas.pricing import QuoteRequest
from app.schemas.recommendation import (
    BriefInput,
    ExclusionReason,
    ShortlistEntry,
    VenueCandidate,
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

# Fast, cheap model — a reorder task, not generative copy (that's G2).
RERANK_MODEL = "gpt-4o-mini"


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


RERANK_TOOL = {
    "type": "function",
    "function": {
        "name": "reorder_shortlist",
        "description": (
            "Reorder a venue shortlist by fit against the client's soft criteria. "
            "You may ONLY reorder the given venue_ids — never add, remove, or invent one."
        ),
        "parameters": {
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
    },
}


def rerank_shortlist(brief: BriefInput, shortlist: list[ShortlistEntry]) -> list[ShortlistEntry]:
    """GPT re-rank (task E2). Structurally cannot add/remove entries:
    any id the model returns that wasn't in the input, or any input id it
    drops, is rejected and the original (E1) order is returned untouched
    rather than silently trusting a malformed reorder."""
    if len(shortlist) <= 1:
        return shortlist

    client = get_openai_client()
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
    response = client.chat.completions.create(
        model=RERANK_MODEL,
        messages=[{"role": "user", "content": prompt}],
        tools=[RERANK_TOOL],
        tool_choice={"type": "function", "function": {"name": "reorder_shortlist"}},
    )
    tool_call = response.choices[0].message.tool_calls[0]
    arguments = json.loads(tool_call.function.arguments)
    ordered_ids = [UUID(v) for v in arguments["ordered_venue_ids"]]

    original_ids = {e.venue_id for e in shortlist}
    if set(ordered_ids) != original_ids:
        return shortlist  # malformed reorder — fall back to E1's order, don't trust it

    by_id = {e.venue_id: e for e in shortlist}
    return [
        by_id[vid].model_copy(update={"sort_order": i}) for i, vid in enumerate(ordered_ids)
    ]
