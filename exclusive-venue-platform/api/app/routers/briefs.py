"""AI Brief Parser endpoints (tasks D1/D2): parse an enquiry into a
versioned, structured brief. The parse itself is a tool-calling call
through the provider-agnostic app/core/llm.py (app/services/brief_parser.py)
— its output is never trusted as-is: it's validated against ParsedBrief,
then persisted with a deterministic review_status (D2) that a human can
override via PATCH (backs the D4 UI).
"""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from postgrest.exceptions import APIError
from supabase import Client

from app.core.auth import StaffUser, require_staff_session
from app.core.llm import LLMCallError, LLMUnavailableError
from app.core.scoped_client import get_scoped_client
from app.schemas.brief import Brief, BriefUpdate
from app.services.brief_parser import current_parser_model, parse_enquiry, score_review_status

router = APIRouter(prefix="/enquiries/{enquiry_id}/briefs", tags=["briefs"])

ScopedClient = Annotated[Client, Depends(get_scoped_client)]
Staff = Annotated[StaffUser, Depends(require_staff_session)]


def _raise_for_postgrest(exc: APIError) -> None:
    code = (exc.code or "").upper()
    if code in {"42501", "PGRST301"}:
        raise HTTPException(status.HTTP_403_FORBIDDEN, exc.message) from exc
    if code == "23505":
        raise HTTPException(status.HTTP_409_CONFLICT, "Already exists") from exc
    raise HTTPException(status.HTTP_400_BAD_REQUEST, exc.message) from exc


def _get_enquiry_or_404(client: Client, enquiry_id: UUID) -> dict:
    try:
        result = client.table("enquiries").select("*").eq("id", str(enquiry_id)).execute()
    except APIError as exc:
        _raise_for_postgrest(exc)
    if not result.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Enquiry not found")
    return result.data[0]


@router.get("", response_model=list[Brief])
def list_briefs(enquiry_id: UUID, client: ScopedClient, _: Staff):
    try:
        result = (
            client.table("briefs")
            .select("*")
            .eq("enquiry_id", str(enquiry_id))
            .order("version", desc=True)
            .execute()
        )
    except APIError as exc:
        _raise_for_postgrest(exc)
    return result.data


@router.post("/parse", response_model=Brief, status_code=status.HTTP_201_CREATED)
def parse_brief(enquiry_id: UUID, client: ScopedClient, _: Staff):
    enquiry = _get_enquiry_or_404(client, enquiry_id)

    try:
        parsed = parse_enquiry(enquiry["raw_content"])
    except LLMUnavailableError as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(exc)) from exc
    except LLMCallError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"Parser call failed: {exc}") from exc

    existing = (
        client.table("briefs")
        .select("version")
        .eq("enquiry_id", str(enquiry_id))
        .order("version", desc=True)
        .limit(1)
        .execute()
    )
    next_version = (existing.data[0]["version"] + 1) if existing.data else 1

    body = {
        **parsed.model_dump(mode="json", exclude={"contact_hint"}),
        "enquiry_id": str(enquiry_id),
        "version": next_version,
        "review_status": score_review_status(parsed.confidence),
        "parser_model": current_parser_model(),
    }
    try:
        result = client.table("briefs").insert(body).execute()
    except APIError as exc:
        _raise_for_postgrest(exc)
    return result.data[0]


@router.get("/{brief_id}", response_model=Brief)
def get_brief(enquiry_id: UUID, brief_id: UUID, client: ScopedClient, _: Staff):
    try:
        result = (
            client.table("briefs")
            .select("*")
            .eq("id", str(brief_id))
            .eq("enquiry_id", str(enquiry_id))
            .execute()
        )
    except APIError as exc:
        _raise_for_postgrest(exc)
    if not result.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Brief not found")
    return result.data[0]


@router.patch("/{brief_id}", response_model=Brief)
def update_brief(
    enquiry_id: UUID, brief_id: UUID, payload: BriefUpdate, client: ScopedClient, staff: Staff
):
    """Backs the D4 review UI: a human correcting a parsed field, or just
    approving it outright. Any field edit implies human_corrected unless
    the caller explicitly passes review_status (e.g. a bare approval with
    no field changes -> human_approved)."""
    body = payload.model_dump(mode="json", exclude_none=True, exclude={"review_status"})
    review_status = payload.review_status or ("human_corrected" if body else "human_approved")
    body["review_status"] = review_status
    body["reviewed_by"] = staff.user_id

    try:
        result = (
            client.table("briefs")
            .update(body)
            .eq("id", str(brief_id))
            .eq("enquiry_id", str(enquiry_id))
            .execute()
        )
    except APIError as exc:
        _raise_for_postgrest(exc)
    if not result.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Brief not found")
    return result.data[0]
