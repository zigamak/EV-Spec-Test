"""Venue media upload + signed URLs (task B2).

Authorization still flows through Postgres RLS, not this router: the
`venue_media` row is inserted via the caller's own RLS-scoped client
*first*; the actual file bytes only get written to Storage (via the admin
client — the bucket is private, so that's the only way in) after that
insert succeeds. If the DB says no, we never touch the object store.
"""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from postgrest.exceptions import APIError
from supabase import Client

from app.core import storage
from app.core.auth import StaffUser, require_staff_session
from app.core.scoped_client import get_scoped_client
from app.schemas.venue import MediaKind, VenueMedia, VenueMediaUpdate

router = APIRouter(prefix="/venues", tags=["venue-media"])

ScopedClient = Annotated[Client, Depends(get_scoped_client)]
Staff = Annotated[StaffUser, Depends(require_staff_session)]

MAX_UPLOAD_BYTES = 20 * 1024 * 1024


def _raise_for_postgrest(exc: APIError) -> None:
    code = (exc.code or "").upper()
    if code in {"42501", "PGRST301"}:
        raise HTTPException(status.HTTP_403_FORBIDDEN, exc.message) from exc
    if code == "23505":
        raise HTTPException(status.HTTP_409_CONFLICT, "Already exists") from exc
    raise HTTPException(status.HTTP_400_BAD_REQUEST, exc.message) from exc


def _with_signed_url(row: dict) -> dict:
    return {**row, "url": storage.signed_url(row["storage_path"])}


@router.get("/{venue_id}/media", response_model=list[VenueMedia])
def list_media(venue_id: UUID, client: ScopedClient, _: Staff):
    try:
        result = (
            client.table("venue_media")
            .select("*")
            .eq("venue_id", str(venue_id))
            .order("sort_order")
            .execute()
        )
    except APIError as exc:
        _raise_for_postgrest(exc)
    return [_with_signed_url(row) for row in result.data]


@router.post("/{venue_id}/media", response_model=VenueMedia, status_code=status.HTTP_201_CREATED)
async def upload_media(
    venue_id: UUID,
    client: ScopedClient,
    _: Staff,
    file: UploadFile = File(...),
    kind: MediaKind = Form(...),
    caption: str | None = Form(default=None),
    sort_order: int = Form(default=0),
):
    content = await file.read()
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "File exceeds 20MB limit")

    storage_path = storage.build_storage_path(str(venue_id), file.filename or "upload")

    try:
        insert_result = (
            client.table("venue_media")
            .insert(
                {
                    "venue_id": str(venue_id),
                    "storage_path": storage_path,
                    "kind": kind,
                    "sort_order": sort_order,
                    "caption": caption,
                }
            )
            .execute()
        )
    except APIError as exc:
        _raise_for_postgrest(exc)

    row = insert_result.data[0]

    try:
        storage.upload_object(storage_path, content, file.content_type or "application/octet-stream")
    except Exception as exc:
        # Row exists but the file never landed — don't leave a dangling
        # reference to an object that isn't there.
        client.table("venue_media").delete().eq("id", row["id"]).execute()
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Upload to storage failed") from exc

    return _with_signed_url(row)


@router.patch("/{venue_id}/media/{media_id}", response_model=VenueMedia)
def update_media(
    venue_id: UUID, media_id: UUID, payload: VenueMediaUpdate, client: ScopedClient, _: Staff
):
    body = payload.model_dump(mode="json", exclude_none=True)
    try:
        result = (
            client.table("venue_media")
            .update(body)
            .eq("id", str(media_id))
            .eq("venue_id", str(venue_id))
            .execute()
        )
    except APIError as exc:
        _raise_for_postgrest(exc)
    if not result.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Media not found")
    return _with_signed_url(result.data[0])


@router.delete("/{venue_id}/media/{media_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_media(venue_id: UUID, media_id: UUID, client: ScopedClient, _: Staff):
    try:
        result = (
            client.table("venue_media")
            .delete()
            .eq("id", str(media_id))
            .eq("venue_id", str(venue_id))
            .execute()
        )
    except APIError as exc:
        _raise_for_postgrest(exc)
    if not result.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Media not found")

    storage.delete_object(result.data[0]["storage_path"])
