"""Recommendation engine endpoint (tasks E1/E2): a brief -> a filtered,
optionally AI-reranked venue shortlist. The filter (E1) always runs first
and is the only thing that decides membership; rerank (E2) only reorders
what E1 already returned (constitution #1, enforced in
app/services/recommendation_engine.py).
"""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from postgrest.exceptions import APIError
from supabase import Client

from app.core.auth import StaffUser, require_staff_session
from app.core.llm import LLMCallError, LLMUnavailableError
from app.core.scoped_client import get_scoped_client
from app.schemas.pricing import PricingRule, PricingRuleAddon
from app.schemas.recommendation import (
    AvailabilityWindow,
    BriefInput,
    ConfigurationCandidate,
    RestrictionCandidate,
    ShortlistResponse,
    VenueCandidate,
)
from app.services.recommendation_engine import filter_venues, rerank_shortlist

router = APIRouter(prefix="/briefs/{brief_id}/shortlist", tags=["recommendations"])

ScopedClient = Annotated[Client, Depends(get_scoped_client)]
Staff = Annotated[StaffUser, Depends(require_staff_session)]


def _raise_for_postgrest(exc: APIError) -> None:
    code = (exc.code or "").upper()
    if code in {"42501", "PGRST301"}:
        raise HTTPException(status.HTTP_403_FORBIDDEN, exc.message) from exc
    raise HTTPException(status.HTTP_400_BAD_REQUEST, exc.message) from exc


def _load_brief(client: Client, brief_id: UUID) -> BriefInput:
    try:
        result = client.table("briefs").select("*").eq("id", str(brief_id)).execute()
    except APIError as exc:
        _raise_for_postgrest(exc)
    if not result.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Brief not found")
    row = result.data[0]
    if row["guest_count"] is None or row["event_date"] is None or row["duration_hours"] is None:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "Brief is missing guest_count/event_date/duration_hours — cannot build a shortlist yet",
        )
    return BriefInput(
        guest_count=row["guest_count"],
        event_date=row["event_date"],
        duration_hours=row["duration_hours"],
        budget_amount=row["budget_amount"],
        budget_basis=row["budget_basis"],
        requirements=row["requirements"] or {},
    )


def _load_candidates(client: Client, event_date: str) -> list[VenueCandidate]:
    venues = client.table("venues").select("*").eq("status", "active").execute().data
    candidates: list[VenueCandidate] = []

    for venue in venues:
        vid = venue["id"]
        configurations = (
            client.table("venue_configurations").select("*").eq("venue_id", vid).execute().data
        )
        restrictions = (
            client.table("venue_restrictions").select("*").eq("venue_id", vid).execute().data
        )
        availability = (
            client.table("venue_availability").select("*").eq("venue_id", vid).execute().data
        )
        rule_rows = (
            client.table("pricing_rules")
            .select("*")
            .eq("venue_id", vid)
            .lte("effective_from", event_date)
            .order("effective_from", desc=True)
            .execute()
            .data
        )
        active_rule = next(
            (r for r in rule_rows if r.get("effective_to") is None or event_date <= r["effective_to"]),
            None,
        )
        addons = []
        pricing_rule = None
        if active_rule is not None:
            pricing_rule = PricingRule(**active_rule)
            addons = [
                PricingRuleAddon(**row)
                for row in client.table("pricing_rule_addons")
                .select("*")
                .eq("pricing_rules_id", active_rule["id"])
                .execute()
                .data
            ]

        candidates.append(
            VenueCandidate(
                venue_id=vid,
                name=venue["name"],
                status=venue["status"],
                configurations=[ConfigurationCandidate(**c) for c in configurations],
                restrictions=[RestrictionCandidate(**r) for r in restrictions],
                availability=[AvailabilityWindow(**a) for a in availability],
                pricing_rule=pricing_rule,
                pricing_rule_addons=addons,
            )
        )

    return candidates


@router.get("", response_model=ShortlistResponse)
def get_shortlist(brief_id: UUID, client: ScopedClient, _: Staff, rerank: bool = False):
    brief = _load_brief(client, brief_id)
    candidates = _load_candidates(client, brief.event_date.isoformat())
    shortlist, excluded = filter_venues(brief, candidates)

    if rerank and shortlist:
        try:
            shortlist = rerank_shortlist(brief, shortlist)
        except LLMUnavailableError as exc:
            raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(exc)) from exc
        except LLMCallError as exc:
            raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"Re-rank call failed: {exc}") from exc

    return ShortlistResponse(shortlist=shortlist, excluded=excluded)
