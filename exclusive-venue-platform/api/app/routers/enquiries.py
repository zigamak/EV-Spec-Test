"""Enquiry intake CRUD (task C1): organisations, contacts, enquiries.

Same RLS-scoped pattern as venues.py — every handler runs against the
caller's own JWT (app/core/scoped_client.py); Postgres RLS decides what
each request can actually see or write. Public/anon intake (C2/C4) is a
separate, unauthenticated write path (Supabase service role, bypassing
RLS) — not part of this staff-only router.
"""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from postgrest.exceptions import APIError
from pydantic import BaseModel
from supabase import Client

from app.core.auth import StaffUser, require_staff_session
from app.core.scoped_client import get_scoped_client
from app.schemas.activity import ActivityLog
from app.schemas.enquiry import (
    Contact,
    ContactCreate,
    ContactUpdate,
    Enquiry,
    EnquiryCreate,
    EnquiryStage,
    EnquiryUpdate,
    EnquiryWithBriefs,
    Organisation,
    OrganisationCreate,
    OrganisationUpdate,
)
from app.services.activity_log import log_activity
from app.services.stage_machine import (
    STAGE_TO_STATUS,
    EnquiryStatus,
    InvalidTransition,
    validate_transition,
)

router = APIRouter(tags=["enquiries"])

ScopedClient = Annotated[Client, Depends(get_scoped_client)]
Staff = Annotated[StaffUser, Depends(require_staff_session)]


def _raise_for_postgrest(exc: APIError) -> None:
    code = (exc.code or "").upper()
    if code in {"42501", "PGRST301"}:
        raise HTTPException(status.HTTP_403_FORBIDDEN, exc.message) from exc
    if code == "23505":
        raise HTTPException(status.HTTP_409_CONFLICT, "Already exists") from exc
    raise HTTPException(status.HTTP_400_BAD_REQUEST, exc.message) from exc


def _is_admin(client: Client, user_id: str) -> bool:
    """Informational only — used for the auto-assign-on-create default and
    the forwarded_to -> assigned_to resolution below, NOT for authorization.
    RLS (migration 0022) is what actually enforces who can see/change what;
    a wrong answer here just means a slightly wrong default, never a leak
    (user_roles_select_own already lets any caller read their own rows)."""
    try:
        result = (
            client.table("user_roles")
            .select("role")
            .eq("user_id", user_id)
            .eq("role", "admin")
            .execute()
        )
    except APIError:
        return False
    return bool(result.data)


# --- organisations ---------------------------------------------------------


@router.get("/organisations", response_model=list[Organisation])
def list_organisations(client: ScopedClient, _: Staff, search: str | None = None):
    query = client.table("organisations").select("*").order("name")
    if search:
        query = query.ilike("name", f"%{search}%")
    try:
        result = query.execute()
    except APIError as exc:
        _raise_for_postgrest(exc)
    return result.data


@router.post("/organisations", response_model=Organisation, status_code=status.HTTP_201_CREATED)
def create_organisation(payload: OrganisationCreate, client: ScopedClient, _: Staff):
    body = payload.model_dump(mode="json", exclude_none=True)
    try:
        result = client.table("organisations").insert(body).execute()
    except APIError as exc:
        _raise_for_postgrest(exc)
    return result.data[0]


@router.get("/organisations/{organisation_id}", response_model=Organisation)
def get_organisation(organisation_id: UUID, client: ScopedClient, _: Staff):
    try:
        result = (
            client.table("organisations").select("*").eq("id", str(organisation_id)).execute()
        )
    except APIError as exc:
        _raise_for_postgrest(exc)
    if not result.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Organisation not found")
    return result.data[0]


@router.patch("/organisations/{organisation_id}", response_model=Organisation)
def update_organisation(
    organisation_id: UUID, payload: OrganisationUpdate, client: ScopedClient, _: Staff
):
    body = payload.model_dump(mode="json", exclude_none=True)
    if not body:
        return get_organisation(organisation_id, client, _)
    try:
        result = (
            client.table("organisations")
            .update(body)
            .eq("id", str(organisation_id))
            .execute()
        )
    except APIError as exc:
        _raise_for_postgrest(exc)
    if not result.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Organisation not found")
    return result.data[0]


# --- contacts ----------------------------------------------------------


@router.get("/contacts", response_model=list[Contact])
def list_contacts(client: ScopedClient, _: Staff, search: str | None = None):
    query = client.table("contacts").select("*").order("created_at", desc=True)
    if search:
        query = query.or_(f"full_name.ilike.%{search}%,email.ilike.%{search}%")
    try:
        result = query.execute()
    except APIError as exc:
        _raise_for_postgrest(exc)
    return result.data


@router.post("/contacts", response_model=Contact, status_code=status.HTTP_201_CREATED)
def create_contact(payload: ContactCreate, client: ScopedClient, _: Staff):
    body = payload.model_dump(mode="json", exclude_none=True)
    try:
        result = client.table("contacts").insert(body).execute()
    except APIError as exc:
        _raise_for_postgrest(exc)
    return result.data[0]


@router.get("/contacts/{contact_id}", response_model=Contact)
def get_contact(contact_id: UUID, client: ScopedClient, _: Staff):
    try:
        result = client.table("contacts").select("*").eq("id", str(contact_id)).execute()
    except APIError as exc:
        _raise_for_postgrest(exc)
    if not result.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Contact not found")
    return result.data[0]


@router.patch("/contacts/{contact_id}", response_model=Contact)
def update_contact(contact_id: UUID, payload: ContactUpdate, client: ScopedClient, _: Staff):
    body = payload.model_dump(mode="json", exclude_none=True)
    if not body:
        return get_contact(contact_id, client, _)
    try:
        result = client.table("contacts").update(body).eq("id", str(contact_id)).execute()
    except APIError as exc:
        _raise_for_postgrest(exc)
    if not result.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Contact not found")
    return result.data[0]


# --- enquiries -----------------------------------------------------------


@router.get("/enquiries", response_model=list[EnquiryWithBriefs])
def list_enquiries(
    client: ScopedClient,
    _: Staff,
    stage: EnquiryStage | None = None,
    pipeline_status: EnquiryStatus | None = None,
    assigned_to: UUID | None = None,
):
    """Embeds every brief version per enquiry via PostgREST's relationship
    syntax (`briefs(*)`) in the same round trip — avoids callers looping
    back with one `GET .../briefs` per enquiry (found live 16 Jul as one
    of the two worst N+1 offenders alongside the Calendar venue/availability
    loop). Callers should pick the highest `version` themselves.

    `pipeline_status` (added 18 Jul, H3) filters by the Open/Awaiting/Won/
    Lost rollup — translated to the matching set of real `stage` values
    before hitting Postgres, since it isn't a stored column (erd.md §5.1).
    Named to avoid shadowing FastAPI's `status` (HTTP status codes) import
    used elsewhere in this router."""
    query = client.table("enquiries").select("*, briefs(*)").order("created_at", desc=True)
    if stage:
        query = query.eq("stage", stage)
    if pipeline_status:
        matching_stages = [s for s, st in STAGE_TO_STATUS.items() if st == pipeline_status]
        query = query.in_("stage", matching_stages)
    if assigned_to:
        query = query.eq("assigned_to", str(assigned_to))
    try:
        result = query.execute()
    except APIError as exc:
        _raise_for_postgrest(exc)
    return result.data


@router.post("/enquiries", response_model=Enquiry, status_code=status.HTTP_201_CREATED)
def create_enquiry(payload: EnquiryCreate, client: ScopedClient, staff: Staff):
    # Staff-entered enquiries (manual entry, C3) always carry created_by;
    # anonymous intake (C2/C4) is a separate service-role write path with
    # created_by left null (erd.md §5) and never reaches this handler.
    body = {
        **payload.model_dump(mode="json", exclude_none=True),
        "created_by": staff.user_id,
    }
    # Role-based access (workflow overhaul, migration 0022): a plain staff
    # member manually logging an enquiry already owns it — auto-assign so
    # they can see it back under enquiries_staff_select_own immediately.
    # An admin's manual entry is left unassigned (goes to the shared pool)
    # unless they explicitly pass assigned_to.
    if "assigned_to" not in body and not _is_admin(client, staff.user_id):
        body["assigned_to"] = staff.user_id
    try:
        result = client.table("enquiries").insert(body).execute()
    except APIError as exc:
        _raise_for_postgrest(exc)
    return result.data[0]


def _get_enquiry_or_404(client: Client, enquiry_id: UUID) -> dict:
    try:
        result = client.table("enquiries").select("*").eq("id", str(enquiry_id)).execute()
    except APIError as exc:
        _raise_for_postgrest(exc)
    if not result.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Enquiry not found")
    return result.data[0]


@router.get("/enquiries/{enquiry_id}", response_model=Enquiry)
def get_enquiry(enquiry_id: UUID, client: ScopedClient, _: Staff):
    return _get_enquiry_or_404(client, enquiry_id)


@router.patch("/enquiries/{enquiry_id}", response_model=Enquiry)
def update_enquiry(enquiry_id: UUID, payload: EnquiryUpdate, client: ScopedClient, staff: Staff):
    body = payload.model_dump(mode="json", exclude_none=True)
    if not body:
        return _get_enquiry_or_404(client, enquiry_id)

    # Role-based access (workflow overhaul, migration 0022) — forwarded_to
    # is the display name shown everywhere in the UI; resolve it to the
    # matching profile's auth id so assigned_to (what RLS's ownership
    # clause actually checks) tracks it. A plain staff member's own UPDATE
    # can't pass enquiries_staff_update_own's WITH CHECK if this changes
    # assigned_to away from themselves, so in practice only an admin's
    # forward can ever take effect — this is what makes that a real,
    # DB-enforced boundary rather than just a UI convention.
    if body.get("forwarded_to"):
        try:
            match = (
                client.table("profiles")
                .select("id")
                .eq("full_name", body["forwarded_to"])
                .execute()
            )
        except APIError as exc:
            _raise_for_postgrest(exc)
        if match.data:
            body["assigned_to"] = match.data[0]["id"]

    try:
        result = client.table("enquiries").update(body).eq("id", str(enquiry_id)).execute()
    except APIError as exc:
        _raise_for_postgrest(exc)
    if not result.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Enquiry not found")

    # Audit: a forward is the notable case; anything else is a generic edit.
    forwarded = "forwarded_to" in body
    log_activity(
        client,
        action="enquiry.forwarded" if forwarded else "enquiry.updated",
        actor_type="human",
        actor_id=staff.user_id,
        actor_label=staff.email,
        entity_type="enquiry",
        entity_id=str(enquiry_id),
        enquiry_id=str(enquiry_id),
        summary=(
            f"Forwarded to {body['forwarded_to']}" if forwarded else f"Updated {', '.join(body)}"
        ),
        metadata={"changed": body},
    )
    return result.data[0]


@router.get("/enquiries/{enquiry_id}/activity", response_model=list[ActivityLog])
def list_enquiry_activity(enquiry_id: UUID, client: ScopedClient, _: Staff):
    """The enquiry's audit timeline (task K1) — every AI and human action on
    it, newest first, including errors. RLS gates read access to staff."""
    try:
        result = (
            client.table("activity_log")
            .select("*")
            .eq("enquiry_id", str(enquiry_id))
            .order("created_at", desc=True)
            .execute()
        )
    except APIError as exc:
        _raise_for_postgrest(exc)
    return result.data


class StageTransitionRequest(BaseModel):
    stage: EnquiryStage
    lost_reason: str | None = None


class AssignmentRequest(BaseModel):
    assigned_to: UUID | None = None


@router.post("/enquiries/{enquiry_id}/transition", response_model=Enquiry)
def transition_enquiry(
    enquiry_id: UUID, payload: StageTransitionRequest, client: ScopedClient, staff: Staff
):
    """Task H1's stage machine. The only sanctioned way to move an
    enquiry's stage — validated against ALLOWED_TRANSITIONS before ever
    reaching Postgres, so an invalid jump (e.g. enquiry -> signed) is
    rejected here with a clear 409, not a confusing CHECK-constraint
    error from the DB."""
    current = _get_enquiry_or_404(client, enquiry_id)
    try:
        validate_transition(current["stage"], payload.stage)
    except InvalidTransition as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc

    if payload.stage == "lost" and not payload.lost_reason:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY, "lost_reason is required when moving to 'lost'"
        )

    body = {"stage": payload.stage}
    if payload.lost_reason:
        body["lost_reason"] = payload.lost_reason

    try:
        result = client.table("enquiries").update(body).eq("id", str(enquiry_id)).execute()
    except APIError as exc:
        _raise_for_postgrest(exc)
    if not result.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Enquiry not found")

    # Audit (workflow overhaul) — stage moves are the most consequential
    # change an enquiry ever goes through; previously unlogged, which meant
    # the Contacts conversation timeline and this enquiry's own /activity
    # feed had no record of enquiry->briefed->proposed->held->signed/lost.
    log_activity(
        client,
        action="enquiry.transitioned",
        actor_type="human",
        actor_id=staff.user_id,
        actor_label=staff.email,
        entity_type="enquiry",
        entity_id=str(enquiry_id),
        enquiry_id=str(enquiry_id),
        summary=(
            f"Declined: {payload.lost_reason}"
            if payload.stage == "lost"
            else f"Moved to {payload.stage}"
        ),
        metadata={"from_stage": current["stage"], "to_stage": payload.stage, "lost_reason": payload.lost_reason},
    )
    return result.data[0]


@router.post("/enquiries/{enquiry_id}/assign", response_model=Enquiry)
def assign_enquiry(enquiry_id: UUID, payload: AssignmentRequest, client: ScopedClient, _: Staff):
    body = {"assigned_to": str(payload.assigned_to) if payload.assigned_to else None}
    try:
        result = (
            client.table("enquiries")
            .update(body)
            .eq("id", str(enquiry_id))
            .execute()
        )
    except APIError as exc:
        _raise_for_postgrest(exc)
    if not result.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Enquiry not found")
    return result.data[0]
