"""Venue Profile page support (task B3 follow-up, 18 Jul): activations,
films, and team contacts CRUD, plus the combined `/profile` embed that
replaces eight separate round trips (venue, configurations, restrictions,
media, activations, films, team contacts, pricing rules, availability)
with one — same rationale as `/venues/portfolio` in routers/venues.py.
Both the Venue Profile page and the Venue Edit page (24 Jul perf pass)
now read from this single endpoint instead of firing their own calls.
"""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from postgrest.exceptions import APIError
from supabase import Client

from app.core import storage
from app.core.auth import StaffUser, require_staff_session
from app.core.scoped_client import get_scoped_client
from app.schemas.venue import (
    VenueActivation,
    VenueActivationCreate,
    VenueActivationUpdate,
    VenueFilm,
    VenueFilmCreate,
    VenueFilmUpdate,
    VenueTeamContact,
    VenueTeamContactCreate,
    VenueTeamContactUpdate,
    VenueWithProfile,
)

router = APIRouter(prefix="/venues", tags=["venue-profile"])

ScopedClient = Annotated[Client, Depends(get_scoped_client)]
Staff = Annotated[StaffUser, Depends(require_staff_session)]


def _raise_for_postgrest(exc: APIError) -> None:
    code = str(exc.code or "").upper()
    if code in {"42501", "PGRST301"}:
        raise HTTPException(status.HTTP_403_FORBIDDEN, exc.message) from exc
    if code == "23505":
        raise HTTPException(status.HTTP_409_CONFLICT, "Already exists") from exc
    raise HTTPException(status.HTTP_400_BAD_REQUEST, exc.message) from exc


@router.get("/{venue_id}/profile", response_model=VenueWithProfile)
def get_venue_profile(venue_id: UUID, client: ScopedClient, _: Staff):
    try:
        result = (
            client.table("venues")
            .select(
                "*, venue_media!venue_media_venue_id_fkey(*), venue_configurations(*), "
                "venue_restrictions(*), venue_activations(*), venue_films(*), "
                "venue_team_contacts(*), pricing_rules(*), venue_availability(*)"
            )
            .eq("id", str(venue_id))
            .execute()
        )
    except APIError as exc:
        _raise_for_postgrest(exc)
    if not result.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Venue not found")

    venue = result.data[0]
    media_paths = [m["storage_path"] for m in venue.get("venue_media", [])]
    url_by_path = storage.signed_urls(media_paths)
    media_url_by_id = {}
    for m in venue.get("venue_media", []):
        m["url"] = url_by_path.get(m["storage_path"])
        media_url_by_id[m["id"]] = m["url"]
    for f in venue.get("venue_films", []):
        f["video_url"] = media_url_by_id.get(f.get("video_media_id"))

    return venue


# --- venue_activations ------------------------------------------------------


@router.get("/{venue_id}/activations", response_model=list[VenueActivation])
def list_activations(venue_id: UUID, client: ScopedClient, _: Staff):
    try:
        result = (
            client.table("venue_activations")
            .select("*")
            .eq("venue_id", str(venue_id))
            .order("sort_order")
            .execute()
        )
    except APIError as exc:
        _raise_for_postgrest(exc)
    return result.data


@router.post(
    "/{venue_id}/activations", response_model=VenueActivation, status_code=status.HTTP_201_CREATED
)
def create_activation(venue_id: UUID, payload: VenueActivationCreate, client: ScopedClient, _: Staff):
    body = {**payload.model_dump(mode="json", exclude_none=True), "venue_id": str(venue_id)}
    try:
        result = client.table("venue_activations").insert(body).execute()
    except APIError as exc:
        _raise_for_postgrest(exc)
    return result.data[0]


@router.patch("/{venue_id}/activations/{activation_id}", response_model=VenueActivation)
def update_activation(
    venue_id: UUID, activation_id: UUID, payload: VenueActivationUpdate, client: ScopedClient, _: Staff
):
    body = payload.model_dump(mode="json", exclude_none=True)
    try:
        result = (
            client.table("venue_activations")
            .update(body)
            .eq("id", str(activation_id))
            .eq("venue_id", str(venue_id))
            .execute()
        )
    except APIError as exc:
        _raise_for_postgrest(exc)
    if not result.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Activation not found")
    return result.data[0]


@router.delete("/{venue_id}/activations/{activation_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_activation(venue_id: UUID, activation_id: UUID, client: ScopedClient, _: Staff):
    try:
        result = (
            client.table("venue_activations")
            .delete()
            .eq("id", str(activation_id))
            .eq("venue_id", str(venue_id))
            .execute()
        )
    except APIError as exc:
        _raise_for_postgrest(exc)
    if not result.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Activation not found")


# --- venue_films -------------------------------------------------------


@router.get("/{venue_id}/films", response_model=list[VenueFilm])
def list_films(venue_id: UUID, client: ScopedClient, _: Staff):
    try:
        result = (
            client.table("venue_films")
            .select("*")
            .eq("venue_id", str(venue_id))
            .order("sort_order")
            .execute()
        )
    except APIError as exc:
        _raise_for_postgrest(exc)
    return result.data


@router.post("/{venue_id}/films", response_model=VenueFilm, status_code=status.HTTP_201_CREATED)
def create_film(venue_id: UUID, payload: VenueFilmCreate, client: ScopedClient, _: Staff):
    body = {**payload.model_dump(mode="json", exclude_none=True), "venue_id": str(venue_id)}
    try:
        result = client.table("venue_films").insert(body).execute()
    except APIError as exc:
        _raise_for_postgrest(exc)
    return result.data[0]


@router.patch("/{venue_id}/films/{film_id}", response_model=VenueFilm)
def update_film(venue_id: UUID, film_id: UUID, payload: VenueFilmUpdate, client: ScopedClient, _: Staff):
    body = payload.model_dump(mode="json", exclude_none=True)
    try:
        result = (
            client.table("venue_films")
            .update(body)
            .eq("id", str(film_id))
            .eq("venue_id", str(venue_id))
            .execute()
        )
    except APIError as exc:
        _raise_for_postgrest(exc)
    if not result.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Film not found")
    return result.data[0]


@router.delete("/{venue_id}/films/{film_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_film(venue_id: UUID, film_id: UUID, client: ScopedClient, _: Staff):
    try:
        result = (
            client.table("venue_films")
            .delete()
            .eq("id", str(film_id))
            .eq("venue_id", str(venue_id))
            .execute()
        )
    except APIError as exc:
        _raise_for_postgrest(exc)
    if not result.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Film not found")


# --- venue_team_contacts -----------------------------------------------


@router.get("/{venue_id}/team", response_model=list[VenueTeamContact])
def list_team_contacts(venue_id: UUID, client: ScopedClient, _: Staff):
    try:
        result = (
            client.table("venue_team_contacts")
            .select("*")
            .eq("venue_id", str(venue_id))
            .order("sort_order")
            .execute()
        )
    except APIError as exc:
        _raise_for_postgrest(exc)
    return result.data


@router.post(
    "/{venue_id}/team", response_model=VenueTeamContact, status_code=status.HTTP_201_CREATED
)
def create_team_contact(venue_id: UUID, payload: VenueTeamContactCreate, client: ScopedClient, _: Staff):
    body = {**payload.model_dump(mode="json", exclude_none=True), "venue_id": str(venue_id)}
    try:
        result = client.table("venue_team_contacts").insert(body).execute()
    except APIError as exc:
        _raise_for_postgrest(exc)
    return result.data[0]


@router.patch("/{venue_id}/team/{contact_id}", response_model=VenueTeamContact)
def update_team_contact(
    venue_id: UUID, contact_id: UUID, payload: VenueTeamContactUpdate, client: ScopedClient, _: Staff
):
    body = payload.model_dump(mode="json", exclude_none=True)
    try:
        result = (
            client.table("venue_team_contacts")
            .update(body)
            .eq("id", str(contact_id))
            .eq("venue_id", str(venue_id))
            .execute()
        )
    except APIError as exc:
        _raise_for_postgrest(exc)
    if not result.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Team contact not found")
    return result.data[0]


@router.delete("/{venue_id}/team/{contact_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_team_contact(venue_id: UUID, contact_id: UUID, client: ScopedClient, _: Staff):
    try:
        result = (
            client.table("venue_team_contacts")
            .delete()
            .eq("id", str(contact_id))
            .eq("venue_id", str(venue_id))
            .execute()
        )
    except APIError as exc:
        _raise_for_postgrest(exc)
    if not result.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Team contact not found")
