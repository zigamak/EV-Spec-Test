"""Venue CRUD (task B1). Every handler runs against a Supabase client
scoped to the caller's own JWT (app/core/scoped_client.py) — Postgres RLS
decides what each request can actually see or write, this router just
shapes requests/responses and surfaces RLS denials as HTTP errors.
"""

from datetime import UTC
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from postgrest.exceptions import APIError
from supabase import Client

from app.core import storage
from app.core.auth import StaffUser, require_staff_session
from app.core.scoped_client import get_scoped_client
from app.schemas.venue import (
    Venue,
    VenueAvailability,
    VenueAvailabilityCreate,
    VenueConfiguration,
    VenueConfigurationCreate,
    VenueConfigurationUpdate,
    VenueCreate,
    VenueRestriction,
    VenueRestrictionCreate,
    VenueRestrictionUpdate,
    VenueUpdate,
    VenueWithAvailability,
    VenueWithPortfolio,
)

router = APIRouter(prefix="/venues", tags=["venues"])

ScopedClient = Annotated[Client, Depends(get_scoped_client)]
Staff = Annotated[StaffUser, Depends(require_staff_session)]


def _raise_for_postgrest(exc: APIError) -> None:
    # RLS denials surface as either an empty affected-rows result (handled
    # by callers) or a Postgres permission/check-constraint error here.
    code = str(exc.code or "").upper()
    if code in {"42501", "PGRST301"}:
        raise HTTPException(status.HTTP_403_FORBIDDEN, exc.message) from exc
    if code == "23505":
        raise HTTPException(status.HTTP_409_CONFLICT, "Already exists") from exc
    raise HTTPException(status.HTTP_400_BAD_REQUEST, exc.message) from exc


def _get_venue_or_404(client: Client, venue_id: UUID) -> dict:
    try:
        result = client.table("venues").select("*").eq("id", str(venue_id)).execute()
    except APIError as exc:
        _raise_for_postgrest(exc)
    if not result.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Venue not found")
    return result.data[0]


@router.get("", response_model=list[Venue])
def list_venues(client: ScopedClient, _: Staff, status_filter: str | None = None):
    query = client.table("venues").select("*").order("created_at", desc=True)
    if status_filter:
        query = query.eq("status", status_filter)
    try:
        result = query.execute()
    except APIError as exc:
        _raise_for_postgrest(exc)
    return result.data


# NOTE: these two batched routes must stay declared before "/{venue_id}" —
# FastAPI matches path operations in declaration order, so a static route
# after the dynamic one would never be reached (it'd match "/{venue_id}"
# with venue_id="portfolio-availability" instead).


@router.get("/portfolio-availability", response_model=list[VenueWithAvailability])
def list_venues_with_availability(client: ScopedClient, _: Staff, status_filter: str | None = None):
    """Embeds each venue's availability windows via PostgREST's relationship
    syntax in one round trip — replaces the Calendar page's per-venue
    `GET /venues/{id}/availability` loop (found live 16 Jul as one of the
    two worst N+1 offenders)."""
    query = client.table("venues").select("*, availability:venue_availability(*)").order(
        "created_at", desc=True
    )
    if status_filter:
        query = query.eq("status", status_filter)
    try:
        result = query.execute()
    except APIError as exc:
        _raise_for_postgrest(exc)
    return result.data


@router.get("/portfolio", response_model=list[VenueWithPortfolio])
def list_venues_with_portfolio(client: ScopedClient, _: Staff, status_filter: str | None = None):
    """Embeds each venue's media + configurations via PostgREST's
    relationship syntax in one round trip — replaces the Venues page's
    per-venue media/configuration loop (found live 16 Jul)."""
    # venues has two FK relationships to venue_media (venue_media.venue_id,
    # and venues.hero_media_id back to venue_media) — a plain "venue_media(*)"
    # embed is ambiguous (PGRST201) and PostgREST needs the FK constraint
    # name to pick the right one.
    query = client.table("venues").select(
        "*, venue_media!venue_media_venue_id_fkey(*), venue_configurations(*)"
    ).order("created_at", desc=True)
    if status_filter:
        query = query.eq("status", status_filter)
    try:
        result = query.execute()
    except APIError as exc:
        _raise_for_postgrest(exc)
    # Sign every photo across every venue in one Storage round trip. Signing
    # per row here was an N+1 over the network (one round trip per photo);
    # it hasn't bitten yet only because no venue has media rows so far.
    all_paths = [
        media["storage_path"] for venue in result.data for media in venue.get("venue_media", [])
    ]
    url_by_path = storage.signed_urls(all_paths)
    for venue in result.data:
        for media in venue.get("venue_media", []):
            media["url"] = url_by_path.get(media["storage_path"])
    return result.data


@router.get("/{venue_id}", response_model=Venue)
def get_venue(venue_id: UUID, client: ScopedClient, _: Staff):
    return _get_venue_or_404(client, venue_id)


@router.post("", response_model=Venue, status_code=status.HTTP_201_CREATED)
def create_venue(payload: VenueCreate, client: ScopedClient, _: Staff):
    body = payload.model_dump(mode="json", exclude_none=True)
    try:
        result = client.table("venues").insert(body).execute()
    except APIError as exc:
        _raise_for_postgrest(exc)
    return result.data[0]


@router.patch("/{venue_id}", response_model=Venue)
def update_venue(venue_id: UUID, payload: VenueUpdate, client: ScopedClient, _: Staff):
    body = payload.model_dump(mode="json", exclude_none=True)
    if not body:
        return _get_venue_or_404(client, venue_id)
    try:
        result = client.table("venues").update(body).eq("id", str(venue_id)).execute()
    except APIError as exc:
        _raise_for_postgrest(exc)
    if not result.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Venue not found or not writable")
    return result.data[0]


@router.post("/{venue_id}/approve", response_model=Venue)
def approve_venue(venue_id: UUID, client: ScopedClient, staff: Staff):
    # Deliberately no landlord path here: venues_landlord_update_own's
    # WITH CHECK only allows draft/pending_approval, so a landlord calling
    # this gets an RLS-empty result -> 404, never a silent self-activation.
    from datetime import datetime

    body = {
        "status": "active",
        "approved_by": staff.user_id,
        "approved_at": datetime.now(UTC).isoformat(),
    }
    try:
        result = client.table("venues").update(body).eq("id", str(venue_id)).execute()
    except APIError as exc:
        _raise_for_postgrest(exc)
    if not result.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Venue not found or not approvable")
    return result.data[0]


@router.delete("/{venue_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_venue(venue_id: UUID, client: ScopedClient, _: Staff):
    try:
        result = client.table("venues").delete().eq("id", str(venue_id)).execute()
    except APIError as exc:
        _raise_for_postgrest(exc)
    if not result.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Venue not found")


# --- venue_configurations -------------------------------------------------


@router.get("/{venue_id}/configurations", response_model=list[VenueConfiguration])
def list_configurations(venue_id: UUID, client: ScopedClient, _: Staff):
    try:
        result = (
            client.table("venue_configurations")
            .select("*")
            .eq("venue_id", str(venue_id))
            .order("capacity")
            .execute()
        )
    except APIError as exc:
        _raise_for_postgrest(exc)
    return result.data


@router.post(
    "/{venue_id}/configurations",
    response_model=VenueConfiguration,
    status_code=status.HTTP_201_CREATED,
)
def create_configuration(
    venue_id: UUID, payload: VenueConfigurationCreate, client: ScopedClient, _: Staff
):
    body = {**payload.model_dump(mode="json", exclude_none=True), "venue_id": str(venue_id)}
    try:
        result = client.table("venue_configurations").insert(body).execute()
    except APIError as exc:
        _raise_for_postgrest(exc)
    return result.data[0]


@router.patch("/{venue_id}/configurations/{configuration_id}", response_model=VenueConfiguration)
def update_configuration(
    venue_id: UUID,
    configuration_id: UUID,
    payload: VenueConfigurationUpdate,
    client: ScopedClient,
    _: Staff,
):
    body = payload.model_dump(mode="json", exclude_none=True)
    try:
        result = (
            client.table("venue_configurations")
            .update(body)
            .eq("id", str(configuration_id))
            .eq("venue_id", str(venue_id))
            .execute()
        )
    except APIError as exc:
        _raise_for_postgrest(exc)
    if not result.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Configuration not found")
    return result.data[0]


@router.delete(
    "/{venue_id}/configurations/{configuration_id}", status_code=status.HTTP_204_NO_CONTENT
)
def delete_configuration(venue_id: UUID, configuration_id: UUID, client: ScopedClient, _: Staff):
    try:
        result = (
            client.table("venue_configurations")
            .delete()
            .eq("id", str(configuration_id))
            .eq("venue_id", str(venue_id))
            .execute()
        )
    except APIError as exc:
        _raise_for_postgrest(exc)
    if not result.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Configuration not found")


# --- venue_restrictions ----------------------------------------------------


@router.get("/{venue_id}/restrictions", response_model=list[VenueRestriction])
def list_restrictions(venue_id: UUID, client: ScopedClient, _: Staff):
    try:
        result = (
            client.table("venue_restrictions").select("*").eq("venue_id", str(venue_id)).execute()
        )
    except APIError as exc:
        _raise_for_postgrest(exc)
    return result.data


@router.post(
    "/{venue_id}/restrictions",
    response_model=VenueRestriction,
    status_code=status.HTTP_201_CREATED,
)
def create_restriction(
    venue_id: UUID, payload: VenueRestrictionCreate, client: ScopedClient, _: Staff
):
    body = {**payload.model_dump(mode="json", exclude_none=True), "venue_id": str(venue_id)}
    try:
        result = client.table("venue_restrictions").insert(body).execute()
    except APIError as exc:
        _raise_for_postgrest(exc)
    return result.data[0]


@router.patch("/{venue_id}/restrictions/{restriction_id}", response_model=VenueRestriction)
def update_restriction(
    venue_id: UUID,
    restriction_id: UUID,
    payload: VenueRestrictionUpdate,
    client: ScopedClient,
    _: Staff,
):
    body = payload.model_dump(mode="json", exclude_none=True)
    try:
        result = (
            client.table("venue_restrictions")
            .update(body)
            .eq("id", str(restriction_id))
            .eq("venue_id", str(venue_id))
            .execute()
        )
    except APIError as exc:
        _raise_for_postgrest(exc)
    if not result.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Restriction not found")
    return result.data[0]


@router.delete(
    "/{venue_id}/restrictions/{restriction_id}", status_code=status.HTTP_204_NO_CONTENT
)
def delete_restriction(venue_id: UUID, restriction_id: UUID, client: ScopedClient, _: Staff):
    try:
        result = (
            client.table("venue_restrictions")
            .delete()
            .eq("id", str(restriction_id))
            .eq("venue_id", str(venue_id))
            .execute()
        )
    except APIError as exc:
        _raise_for_postgrest(exc)
    if not result.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Restriction not found")


# --- venue_availability ------------------------------------------------
# Full CRUD lands with the calendar UI (B6/J2); for now, list + create
# (holds are created from the Venue Profile page per tasks.md) + cancel.


@router.get("/{venue_id}/availability", response_model=list[VenueAvailability])
def list_availability(venue_id: UUID, client: ScopedClient, _: Staff):
    try:
        result = (
            client.table("venue_availability")
            .select("*")
            .eq("venue_id", str(venue_id))
            .order("starts_on")
            .execute()
        )
    except APIError as exc:
        _raise_for_postgrest(exc)
    return result.data


@router.post(
    "/{venue_id}/availability",
    response_model=VenueAvailability,
    status_code=status.HTTP_201_CREATED,
)
def create_availability(
    venue_id: UUID, payload: VenueAvailabilityCreate, client: ScopedClient, _: Staff
):
    body = {**payload.model_dump(mode="json", exclude_none=True), "venue_id": str(venue_id)}
    try:
        result = client.table("venue_availability").insert(body).execute()
    except APIError as exc:
        _raise_for_postgrest(exc)
    return result.data[0]


@router.delete("/{venue_id}/availability/{availability_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_availability(venue_id: UUID, availability_id: UUID, client: ScopedClient, _: Staff):
    try:
        result = (
            client.table("venue_availability")
            .delete()
            .eq("id", str(availability_id))
            .eq("venue_id", str(venue_id))
            .execute()
        )
    except APIError as exc:
        _raise_for_postgrest(exc)
    if not result.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Availability window not found")
