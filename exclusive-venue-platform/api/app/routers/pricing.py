"""Pricing rules CRUD + quote endpoint (task F1/F2). The quote endpoint is
the only place quote_total ever gets computed — deterministic, zero AI
calls (constitution #1). anon has no RLS policy on pricing_rules at all
(rls-matrix.md hard line); this router is staff/landlord-only regardless.
"""

from datetime import date
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from postgrest.exceptions import APIError
from supabase import Client

from app.core.auth import StaffUser, require_staff_session
from app.core.scoped_client import get_scoped_client
from app.schemas.pricing import (
    PricingRule,
    PricingRuleAddon,
    PricingRuleAddonCreate,
    PricingRuleAddonUpdate,
    PricingRuleCreate,
    PricingRuleUpdate,
    QuoteBreakdown,
    QuoteRequest,
)
from app.services.pricing_engine import calculate_quote

router = APIRouter(prefix="/venues/{venue_id}/pricing-rules", tags=["pricing"])

ScopedClient = Annotated[Client, Depends(get_scoped_client)]
Staff = Annotated[StaffUser, Depends(require_staff_session)]


def _raise_for_postgrest(exc: APIError) -> None:
    code = (exc.code or "").upper()
    if code in {"42501", "PGRST301"}:
        raise HTTPException(status.HTTP_403_FORBIDDEN, exc.message) from exc
    if code == "23505":
        raise HTTPException(status.HTTP_409_CONFLICT, "Already exists") from exc
    raise HTTPException(status.HTTP_400_BAD_REQUEST, exc.message) from exc


def _get_rule_or_404(client: Client, venue_id: UUID, rule_id: UUID) -> dict:
    try:
        result = (
            client.table("pricing_rules")
            .select("*")
            .eq("id", str(rule_id))
            .eq("venue_id", str(venue_id))
            .execute()
        )
    except APIError as exc:
        _raise_for_postgrest(exc)
    if not result.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Pricing rule not found")
    return result.data[0]


@router.get("", response_model=list[PricingRule])
def list_pricing_rules(venue_id: UUID, client: ScopedClient, _: Staff):
    """Embeds each rule's addons via PostgREST's relationship syntax —
    replaces PricingRulesTab.tsx's rules-then-one-GET-per-rule-for-addons
    loop (an N+1 found 24 Jul during a perf pass), same rationale as
    /venues/portfolio in routers/venues.py."""
    try:
        result = (
            client.table("pricing_rules")
            .select("*, pricing_rule_addons(*)")
            .eq("venue_id", str(venue_id))
            .order("effective_from", desc=True)
            .execute()
        )
    except APIError as exc:
        _raise_for_postgrest(exc)
    return result.data


@router.get("/active", response_model=PricingRule)
def get_active_pricing_rule(venue_id: UUID, client: ScopedClient, _: Staff, on_date: date):
    try:
        result = (
            client.table("pricing_rules")
            .select("*")
            .eq("venue_id", str(venue_id))
            .lte("effective_from", on_date.isoformat())
            .order("effective_from", desc=True)
            .execute()
        )
    except APIError as exc:
        _raise_for_postgrest(exc)
    for row in result.data:
        effective_to = row.get("effective_to")
        if effective_to is None or on_date.isoformat() <= effective_to:
            return row
    raise HTTPException(status.HTTP_404_NOT_FOUND, "No pricing rule active on that date")


@router.post("", response_model=PricingRule, status_code=status.HTTP_201_CREATED)
def create_pricing_rule(venue_id: UUID, payload: PricingRuleCreate, client: ScopedClient, _: Staff):
    body = {**payload.model_dump(mode="json", exclude_none=True), "venue_id": str(venue_id)}
    try:
        result = client.table("pricing_rules").insert(body).execute()
    except APIError as exc:
        _raise_for_postgrest(exc)
    return result.data[0]


@router.get("/{rule_id}", response_model=PricingRule)
def get_pricing_rule(venue_id: UUID, rule_id: UUID, client: ScopedClient, _: Staff):
    return _get_rule_or_404(client, venue_id, rule_id)


@router.patch("/{rule_id}", response_model=PricingRule)
def update_pricing_rule(
    venue_id: UUID, rule_id: UUID, payload: PricingRuleUpdate, client: ScopedClient, _: Staff
):
    body = payload.model_dump(mode="json", exclude_none=True)
    if not body:
        return _get_rule_or_404(client, venue_id, rule_id)
    try:
        result = (
            client.table("pricing_rules")
            .update(body)
            .eq("id", str(rule_id))
            .eq("venue_id", str(venue_id))
            .execute()
        )
    except APIError as exc:
        _raise_for_postgrest(exc)
    if not result.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Pricing rule not found")
    return result.data[0]


@router.delete("/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_pricing_rule(venue_id: UUID, rule_id: UUID, client: ScopedClient, _: Staff):
    try:
        result = (
            client.table("pricing_rules")
            .delete()
            .eq("id", str(rule_id))
            .eq("venue_id", str(venue_id))
            .execute()
        )
    except APIError as exc:
        _raise_for_postgrest(exc)
    if not result.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Pricing rule not found")


# --- pricing_rule_addons -----------------------------------------------


@router.get("/{rule_id}/addons", response_model=list[PricingRuleAddon])
def list_addons(venue_id: UUID, rule_id: UUID, client: ScopedClient, _: Staff):
    _get_rule_or_404(client, venue_id, rule_id)
    try:
        result = (
            client.table("pricing_rule_addons")
            .select("*")
            .eq("pricing_rules_id", str(rule_id))
            .execute()
        )
    except APIError as exc:
        _raise_for_postgrest(exc)
    return result.data


@router.post("/{rule_id}/addons", response_model=PricingRuleAddon, status_code=status.HTTP_201_CREATED)
def create_addon(
    venue_id: UUID, rule_id: UUID, payload: PricingRuleAddonCreate, client: ScopedClient, _: Staff
):
    _get_rule_or_404(client, venue_id, rule_id)
    body = {**payload.model_dump(mode="json", exclude_none=True), "pricing_rules_id": str(rule_id)}
    try:
        result = client.table("pricing_rule_addons").insert(body).execute()
    except APIError as exc:
        _raise_for_postgrest(exc)
    return result.data[0]


@router.patch("/{rule_id}/addons/{addon_id}", response_model=PricingRuleAddon)
def update_addon(
    venue_id: UUID,
    rule_id: UUID,
    addon_id: UUID,
    payload: PricingRuleAddonUpdate,
    client: ScopedClient,
    _: Staff,
):
    _get_rule_or_404(client, venue_id, rule_id)
    body = payload.model_dump(mode="json", exclude_none=True)
    try:
        result = (
            client.table("pricing_rule_addons")
            .update(body)
            .eq("id", str(addon_id))
            .eq("pricing_rules_id", str(rule_id))
            .execute()
        )
    except APIError as exc:
        _raise_for_postgrest(exc)
    if not result.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Addon not found")
    return result.data[0]


@router.delete("/{rule_id}/addons/{addon_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_addon(venue_id: UUID, rule_id: UUID, addon_id: UUID, client: ScopedClient, _: Staff):
    _get_rule_or_404(client, venue_id, rule_id)
    try:
        result = (
            client.table("pricing_rule_addons")
            .delete()
            .eq("id", str(addon_id))
            .eq("pricing_rules_id", str(rule_id))
            .execute()
        )
    except APIError as exc:
        _raise_for_postgrest(exc)
    if not result.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Addon not found")


# --- quote ---------------------------------------------------------------


@router.post("/{rule_id}/quote", response_model=QuoteBreakdown)
def quote(venue_id: UUID, rule_id: UUID, payload: QuoteRequest, client: ScopedClient, _: Staff):
    rule_row = _get_rule_or_404(client, venue_id, rule_id)
    try:
        addon_rows = (
            client.table("pricing_rule_addons")
            .select("*")
            .eq("pricing_rules_id", str(rule_id))
            .execute()
        )
    except APIError as exc:
        _raise_for_postgrest(exc)

    rule = PricingRule(**rule_row)
    addons = [PricingRuleAddon(**row) for row in addon_rows.data]
    return calculate_quote(rule, addons, payload)
