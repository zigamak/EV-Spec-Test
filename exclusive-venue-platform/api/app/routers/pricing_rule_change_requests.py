"""Landlord pricing proposals (tasks D2/D3). A landlord never writes
pricing_rules directly (0005's pricing_rules_landlord_select_own stays
read-only) — they write here instead, and only staff approval turns a
request into a real, versioned pricing_rules row. RLS
(0028_pricing_rule_change_requests.py) already blocks a landlord from
setting status themselves (no landlord UPDATE policy exists at all), but
the approve/reject endpoints below are staff-gated in code too, since
approval also performs a second write (creating the pricing_rules row)
that a landlord must never trigger even indirectly.
"""

from datetime import UTC, datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from postgrest.exceptions import APIError
from supabase import Client

from app.core.auth import StaffUser, require_staff_session
from app.core.scoped_client import get_scoped_client
from app.schemas.pricing_rule_change_request import (
    PricingRuleChangeRequest,
    PricingRuleChangeRequestCreate,
    PricingRuleChangeRequestReview,
)

router = APIRouter(prefix="/venues/{venue_id}/pricing-requests", tags=["pricing-requests"])

ScopedClient = Annotated[Client, Depends(get_scoped_client)]
Caller = Annotated[StaffUser, Depends(require_staff_session)]


def _require_staff_or_admin(client: Client, caller: StaffUser) -> None:
    try:
        roles = client.table("user_roles").select("role").eq("user_id", caller.user_id).execute()
    except APIError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, exc.message) from exc
    if not any(r["role"] in ("staff", "admin") for r in roles.data):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Staff or admin role required")


def _get_request_or_404(client: Client, venue_id: UUID, request_id: UUID) -> dict:
    try:
        result = (
            client.table("pricing_rule_change_requests")
            .select("*")
            .eq("id", str(request_id))
            .eq("venue_id", str(venue_id))
            .execute()
        )
    except APIError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, exc.message) from exc
    if not result.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Pricing change request not found")
    return result.data[0]


@router.get("", response_model=list[PricingRuleChangeRequest])
def list_pricing_requests(venue_id: UUID, client: ScopedClient, _: Caller):
    """RLS scopes this automatically: a landlord only ever sees their own
    venue's requests (pricing_rule_change_requests_landlord_select_own),
    staff sees everything."""
    try:
        result = (
            client.table("pricing_rule_change_requests")
            .select("*")
            .eq("venue_id", str(venue_id))
            .order("created_at", desc=True)
            .execute()
        )
    except APIError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, exc.message) from exc
    return result.data


@router.post("", response_model=PricingRuleChangeRequest, status_code=status.HTTP_201_CREATED)
def create_pricing_request(
    venue_id: UUID, payload: PricingRuleChangeRequestCreate, client: ScopedClient, caller: Caller
):
    """A landlord submitting for their own venue; RLS's insert-own policy
    is what actually enforces ownership + forces status='pending' — this
    endpoint doesn't need to re-check that, only to shape the row."""
    body = {
        "venue_id": str(venue_id),
        "pricing_rules_id": str(payload.pricing_rules_id) if payload.pricing_rules_id else None,
        "proposed_by": caller.user_id,
        "payload": payload.payload.model_dump(mode="json"),
    }
    try:
        result = client.table("pricing_rule_change_requests").insert(body).execute()
    except APIError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, exc.message) from exc
    return result.data[0]


@router.post("/{request_id}/approve", response_model=PricingRuleChangeRequest)
def approve_pricing_request(
    venue_id: UUID,
    request_id: UUID,
    review: PricingRuleChangeRequestReview,
    client: ScopedClient,
    caller: Caller,
):
    _require_staff_or_admin(client, caller)
    change_request = _get_request_or_404(client, venue_id, request_id)
    if change_request["status"] != "pending":
        raise HTTPException(status.HTTP_409_CONFLICT, "Request already reviewed")

    # Creates a NEW versioned pricing_rules row — never mutates an existing
    # one, so any proposal_venues row already quoted against a prior
    # version keeps resolving to that prior version's numbers (F3,
    # Product 1's reproducibility guarantee).
    rule_body = {**change_request["payload"], "venue_id": str(venue_id)}
    try:
        new_rule = client.table("pricing_rules").insert(rule_body).execute()
    except APIError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, exc.message) from exc

    try:
        result = (
            client.table("pricing_rule_change_requests")
            .update(
                {
                    "status": "approved",
                    "reviewed_by": caller.user_id,
                    "reviewed_at": datetime.now(UTC).isoformat(),
                    "review_note": review.review_note,
                    "pricing_rules_id": new_rule.data[0]["id"],
                }
            )
            .eq("id", str(request_id))
            .execute()
        )
    except APIError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, exc.message) from exc
    return result.data[0]


@router.post("/{request_id}/reject", response_model=PricingRuleChangeRequest)
def reject_pricing_request(
    venue_id: UUID,
    request_id: UUID,
    review: PricingRuleChangeRequestReview,
    client: ScopedClient,
    caller: Caller,
):
    _require_staff_or_admin(client, caller)
    change_request = _get_request_or_404(client, venue_id, request_id)
    if change_request["status"] != "pending":
        raise HTTPException(status.HTTP_409_CONFLICT, "Request already reviewed")

    try:
        result = (
            client.table("pricing_rule_change_requests")
            .update(
                {
                    "status": "rejected",
                    "reviewed_by": caller.user_id,
                    "reviewed_at": datetime.now(UTC).isoformat(),
                    "review_note": review.review_note,
                }
            )
            .eq("id", str(request_id))
            .execute()
        )
    except APIError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, exc.message) from exc
    return result.data[0]
