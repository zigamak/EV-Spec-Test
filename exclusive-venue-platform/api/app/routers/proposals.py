"""Proposal builder CRUD (task G1): proposals, proposal_venues, and
shareable link tokens. Same RLS-scoped pattern as venues.py/enquiries.py —
Postgres RLS is the actual authority. The public, token-based read path
lives in routers/public_proposals.py, not here (anon has no RLS policy on
these tables at all).
"""

from datetime import UTC
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import Response
from postgrest.exceptions import APIError
from supabase import Client

from app.core import storage
from app.core.auth import StaffUser, require_staff_session
from app.core.llm import LLMCallError, LLMUnavailableError
from app.core.scoped_client import get_scoped_client
from app.schemas.proposal import (
    Proposal,
    ProposalCreate,
    ProposalLinkToken,
    ProposalUpdate,
    ProposalVenue,
    ProposalVenueCreate,
    ProposalVenueUpdate,
)
from app.services.activity_log import log_activity
from app.services.copy_generator import (
    generate_intro_copy,
    generate_personal_email,
    generate_venue_copy,
)
from app.services.proposal_links import default_expiry, generate_token
from app.services.proposal_pdf import proposal_pdf_bytes, render_proposal_html

router = APIRouter(tags=["proposals"])

ScopedClient = Annotated[Client, Depends(get_scoped_client)]
Staff = Annotated[StaffUser, Depends(require_staff_session)]


def _raise_for_postgrest(exc: APIError) -> None:
    code = (exc.code or "").upper()
    if code in {"42501", "PGRST301"}:
        raise HTTPException(status.HTTP_403_FORBIDDEN, exc.message) from exc
    if code == "23503":
        raise HTTPException(
            status.HTTP_409_CONFLICT, "Referenced venue/configuration/pricing rule can't be removed"
        ) from exc
    raise HTTPException(status.HTTP_400_BAD_REQUEST, exc.message) from exc


def _get_proposal_or_404(client: Client, proposal_id: UUID) -> dict:
    try:
        result = client.table("proposals").select("*").eq("id", str(proposal_id)).execute()
    except APIError as exc:
        _raise_for_postgrest(exc)
    if not result.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Proposal not found")
    return result.data[0]


@router.get("/proposals", response_model=list[Proposal])
def list_proposals(client: ScopedClient, _: Staff, enquiry_id: UUID | None = None):
    query = client.table("proposals").select("*").order("created_at", desc=True)
    if enquiry_id:
        query = query.eq("enquiry_id", str(enquiry_id))
    try:
        result = query.execute()
    except APIError as exc:
        _raise_for_postgrest(exc)
    return result.data


@router.post("/proposals", response_model=Proposal, status_code=status.HTTP_201_CREATED)
def create_proposal(payload: ProposalCreate, client: ScopedClient, staff: Staff):
    body = {**payload.model_dump(mode="json", exclude_none=True), "created_by": staff.user_id}
    try:
        result = client.table("proposals").insert(body).execute()
    except APIError as exc:
        _raise_for_postgrest(exc)
    proposal = result.data[0]
    log_activity(
        client,
        action="proposal.created",
        actor_type="human",
        actor_id=staff.user_id,
        actor_label=staff.email,
        entity_type="proposal",
        entity_id=proposal["id"],
        enquiry_id=str(payload.enquiry_id),
        summary=f"Created proposal “{proposal['title']}”",
        metadata={"brief_id": str(payload.brief_id)},
    )
    return proposal


@router.get("/proposals/{proposal_id}", response_model=Proposal)
def get_proposal(proposal_id: UUID, client: ScopedClient, _: Staff):
    return _get_proposal_or_404(client, proposal_id)


@router.patch("/proposals/{proposal_id}", response_model=Proposal)
def update_proposal(proposal_id: UUID, payload: ProposalUpdate, client: ScopedClient, _: Staff):
    body = payload.model_dump(mode="json", exclude_none=True)
    if not body:
        return _get_proposal_or_404(client, proposal_id)
    try:
        result = client.table("proposals").update(body).eq("id", str(proposal_id)).execute()
    except APIError as exc:
        _raise_for_postgrest(exc)
    if not result.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Proposal not found")
    return result.data[0]


@router.post("/proposals/{proposal_id}/send", response_model=Proposal)
def send_proposal(proposal_id: UUID, client: ScopedClient, _: Staff):
    from datetime import datetime

    body = {"status": "sent", "sent_at": datetime.now(UTC).isoformat()}
    try:
        result = client.table("proposals").update(body).eq("id", str(proposal_id)).execute()
    except APIError as exc:
        _raise_for_postgrest(exc)
    if not result.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Proposal not found")
    return result.data[0]


@router.post("/proposals/{proposal_id}/generate-intro-copy", response_model=Proposal)
def generate_proposal_intro_copy(proposal_id: UUID, client: ScopedClient, _: Staff):
    """GPT-drafted intro copy (task G2) — written straight into the
    ordinary, editable `intro_copy` column. Never authoritative; a human
    can rewrite it entirely via the plain PATCH endpoint above."""
    proposal = _get_proposal_or_404(client, proposal_id)
    brief = (
        client.table("briefs").select("*").eq("id", proposal["brief_id"]).execute().data[0]
    )
    organisation_name = None
    enquiry = (
        client.table("enquiries").select("*").eq("id", proposal["enquiry_id"]).execute().data
    )
    if enquiry and enquiry[0].get("contact_id"):
        contact = (
            client.table("contacts").select("*").eq("id", enquiry[0]["contact_id"]).execute().data
        )
        if contact and contact[0].get("organisation_id"):
            org = (
                client.table("organisations")
                .select("name")
                .eq("id", contact[0]["organisation_id"])
                .execute()
                .data
            )
            if org:
                organisation_name = org[0]["name"]

    # The actual venues selected — so the copy matches reality (singular vs
    # plural, and can name them) rather than a generic "selection of venues".
    pvs = (
        client.table("proposal_venues")
        .select("venue_id")
        .eq("proposal_id", str(proposal_id))
        .order("sort_order")
        .execute()
        .data
    )
    venue_names: list[str] = []
    for pv in pvs:
        venue = client.table("venues").select("name").eq("id", pv["venue_id"]).execute().data
        if venue:
            venue_names.append(venue[0]["name"])

    # Prefer the proposal's own locked event_date (task D5, 18 Jul) — set
    # once a date is confirmed in the generate-and-share step — falling
    # back to the brief's date_window_start when nothing's locked yet.
    event_date_for_copy = proposal.get("event_date") or brief.get("date_window_start")
    try:
        intro_copy = generate_intro_copy(
            brief.get("event_type"),
            brief.get("guest_count"),
            event_date_for_copy,
            organisation_name,
            venue_names,
        )
    except LLMUnavailableError as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(exc)) from exc
    except LLMCallError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"Copy generation failed: {exc}") from exc

    try:
        result = (
            client.table("proposals")
            .update({"intro_copy": intro_copy})
            .eq("id", str(proposal_id))
            .execute()
        )
    except APIError as exc:
        _raise_for_postgrest(exc)
    return result.data[0]


@router.post("/proposals/{proposal_id}/generate-personal-email", response_model=Proposal)
def generate_proposal_personal_email(proposal_id: UUID, client: ScopedClient, _: Staff):
    """GPT-drafted personal note to the client (task G7) — written into the
    editable `personal_email_copy` column, distinct from intro_copy. Never
    authoritative; a human reviews/edits before sending."""
    proposal = _get_proposal_or_404(client, proposal_id)
    brief = client.table("briefs").select("*").eq("id", proposal["brief_id"]).execute().data[0]

    contact_name = None
    organisation_name = None
    enquiry = client.table("enquiries").select("*").eq("id", proposal["enquiry_id"]).execute().data
    if enquiry and enquiry[0].get("contact_id"):
        contact = (
            client.table("contacts").select("*").eq("id", enquiry[0]["contact_id"]).execute().data
        )
        if contact:
            contact_name = contact[0]["full_name"]
            if contact[0].get("organisation_id"):
                org = (
                    client.table("organisations")
                    .select("name")
                    .eq("id", contact[0]["organisation_id"])
                    .execute()
                    .data
                )
                if org:
                    organisation_name = org[0]["name"]

    pvs = (
        client.table("proposal_venues")
        .select("venue_id")
        .eq("proposal_id", str(proposal_id))
        .execute()
        .data
    )
    venue_names: list[str] = []
    for pv in pvs:
        venue = client.table("venues").select("name").eq("id", pv["venue_id"]).execute().data
        if venue:
            venue_names.append(venue[0]["name"])

    event_date = proposal.get("event_date") or brief.get("date_window_start")
    try:
        email_copy = generate_personal_email(
            contact_name, organisation_name, brief.get("event_type"), event_date, venue_names, None
        )
    except LLMUnavailableError as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(exc)) from exc
    except LLMCallError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"Email draft failed: {exc}") from exc

    try:
        result = (
            client.table("proposals")
            .update({"personal_email_copy": email_copy})
            .eq("id", str(proposal_id))
            .execute()
        )
    except APIError as exc:
        _raise_for_postgrest(exc)
    return result.data[0]


def _proposal_context(client: Client, proposal: dict) -> dict:
    """Gather everything the PDF/preview needs: client, brief meta, and each
    proposal venue with its photos (signed) + priced breakdown."""
    brief = client.table("briefs").select("*").eq("id", proposal["brief_id"]).execute().data[0]

    client_name = "Client"
    enquiry = client.table("enquiries").select("*").eq("id", proposal["enquiry_id"]).execute().data
    if enquiry and enquiry[0].get("contact_id"):
        contact = (
            client.table("contacts").select("*").eq("id", enquiry[0]["contact_id"]).execute().data
        )
        if contact:
            client_name = contact[0]["full_name"]
            if contact[0].get("organisation_id"):
                org = (
                    client.table("organisations")
                    .select("name")
                    .eq("id", contact[0]["organisation_id"])
                    .execute()
                    .data
                )
                if org:
                    client_name = org[0]["name"]

    start, end = brief.get("date_window_start"), brief.get("date_window_end")
    window_str = start if not end or end == start else f"{start} – {end}"

    if brief.get("budget_amount"):
        basis = " / head" if brief.get("budget_basis") == "per_head" else ""
        budget = f"HKD {float(brief['budget_amount']):,.0f}{basis}"
    elif brief.get("budget_status") == "tbc":
        budget = "TBC"
    else:
        budget = "—"

    meta = [
        ("Guests", f"{brief['guest_count']} pax" if brief.get("guest_count") else "—"),
        ("Format", brief.get("event_type") or "—"),
        ("Date", window_str or "—"),
        ("Budget", budget),
    ]

    pvs = (
        client.table("proposal_venues")
        .select("*")
        .eq("proposal_id", proposal["id"])
        .order("sort_order")
        .execute()
        .data
    )
    venues = []
    for pv in pvs:
        venue = client.table("venues").select("*").eq("id", pv["venue_id"]).execute().data[0]
        media = (
            client.table("venue_media")
            .select("storage_path")
            .eq("venue_id", pv["venue_id"])
            .order("sort_order")
            .execute()
            .data
        )
        paths = [m["storage_path"] for m in media]
        url_map = storage.signed_urls(paths)
        images = [url_map[p] for p in paths if p in url_map]

        qb = pv.get("quote_breakdown") or {}

        def _fmt(n):
            return f"HKD {float(n):,.0f}"

        rows = []
        if qb.get("base_rate") is not None:
            rows.append(("Venue rental", _fmt(qb["base_rate"])))
        if qb.get("per_head_total"):
            rows.append(("Per-head catering", _fmt(qb["per_head_total"])))
        if qb.get("duration_overtime_amount"):
            rows.append(("Overtime", _fmt(qb["duration_overtime_amount"])))
        if qb.get("addons_total"):
            rows.append(("Add-ons", _fmt(qb["addons_total"])))

        venues.append(
            {
                "name": venue["name"],
                "district": venue.get("district"),
                "description": venue.get("description"),
                "images": images,
                "rows": rows,
                "total": pv.get("quote_total"),
            }
        )

    return {
        "proposal_ref": f"#{proposal['id'][:4].upper()}",
        "client_name": client_name,
        "event_title": brief.get("event_type") or "Event Proposal",
        "window_str": window_str,
        "intro_copy": proposal.get("intro_copy"),
        "meta": meta,
        "venues": venues,
    }


@router.get("/proposals/{proposal_id}/pdf")
def proposal_pdf(proposal_id: UUID, client: ScopedClient, _: Staff):
    """Branded proposal as a downloadable PDF (task G4). Rendered server-side
    with Chromium (app/services/proposal_pdf.py) so it's true to the design —
    the same document the operator previews, minus the app chrome."""
    proposal = _get_proposal_or_404(client, proposal_id)
    context = _proposal_context(client, proposal)
    html = render_proposal_html(**context)
    pdf = proposal_pdf_bytes(html)
    filename = f"Proposal_{context['proposal_ref'].lstrip('#')}.pdf"
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# --- proposal_venues -----------------------------------------------------


@router.get("/proposals/{proposal_id}/venues", response_model=list[ProposalVenue])
def list_proposal_venues(proposal_id: UUID, client: ScopedClient, _: Staff):
    try:
        result = (
            client.table("proposal_venues")
            .select("*")
            .eq("proposal_id", str(proposal_id))
            .order("sort_order")
            .execute()
        )
    except APIError as exc:
        _raise_for_postgrest(exc)
    return result.data


@router.post(
    "/proposals/{proposal_id}/venues", response_model=ProposalVenue, status_code=status.HTTP_201_CREATED
)
def add_proposal_venue(
    proposal_id: UUID, payload: ProposalVenueCreate, client: ScopedClient, _: Staff
):
    body = {**payload.model_dump(mode="json", exclude_none=True), "proposal_id": str(proposal_id)}
    try:
        result = client.table("proposal_venues").insert(body).execute()
    except APIError as exc:
        _raise_for_postgrest(exc)
    return result.data[0]


@router.patch("/proposals/{proposal_id}/venues/{proposal_venue_id}", response_model=ProposalVenue)
def update_proposal_venue(
    proposal_id: UUID,
    proposal_venue_id: UUID,
    payload: ProposalVenueUpdate,
    client: ScopedClient,
    _: Staff,
):
    body = payload.model_dump(mode="json", exclude_none=True)
    if not body:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No fields to update")
    try:
        result = (
            client.table("proposal_venues")
            .update(body)
            .eq("id", str(proposal_venue_id))
            .eq("proposal_id", str(proposal_id))
            .execute()
        )
    except APIError as exc:
        _raise_for_postgrest(exc)
    if not result.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Proposal venue not found")
    return result.data[0]


@router.post(
    "/proposals/{proposal_id}/venues/{proposal_venue_id}/generate-copy", response_model=ProposalVenue
)
def generate_proposal_venue_copy(
    proposal_id: UUID, proposal_venue_id: UUID, client: ScopedClient, _: Staff
):
    """GPT-drafted per-venue copy (task G2) — same non-authoritative,
    freely-editable pattern as the intro copy above."""
    try:
        pv_result = (
            client.table("proposal_venues")
            .select("*")
            .eq("id", str(proposal_venue_id))
            .eq("proposal_id", str(proposal_id))
            .execute()
        )
    except APIError as exc:
        _raise_for_postgrest(exc)
    if not pv_result.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Proposal venue not found")
    proposal_venue = pv_result.data[0]

    venue = client.table("venues").select("*").eq("id", proposal_venue["venue_id"]).execute().data[0]
    configuration = (
        client.table("venue_configurations")
        .select("*")
        .eq("id", proposal_venue["configuration_id"])
        .execute()
        .data[0]
    )
    proposal = _get_proposal_or_404(client, proposal_id)

    try:
        venue_copy = generate_venue_copy(
            venue["name"],
            venue.get("description"),
            configuration["name"],
            proposal_venue["quote_total"],
            proposal["currency"],
        )
    except LLMUnavailableError as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(exc)) from exc
    except LLMCallError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"Copy generation failed: {exc}") from exc

    try:
        result = (
            client.table("proposal_venues")
            .update({"venue_copy": venue_copy})
            .eq("id", str(proposal_venue_id))
            .execute()
        )
    except APIError as exc:
        _raise_for_postgrest(exc)
    return result.data[0]


@router.delete(
    "/proposals/{proposal_id}/venues/{proposal_venue_id}", status_code=status.HTTP_204_NO_CONTENT
)
def remove_proposal_venue(
    proposal_id: UUID, proposal_venue_id: UUID, client: ScopedClient, _: Staff
):
    try:
        result = (
            client.table("proposal_venues")
            .delete()
            .eq("id", str(proposal_venue_id))
            .eq("proposal_id", str(proposal_id))
            .execute()
        )
    except APIError as exc:
        _raise_for_postgrest(exc)
    if not result.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Proposal venue not found")


# --- proposal_link_tokens ------------------------------------------------


@router.get("/proposals/{proposal_id}/links", response_model=list[ProposalLinkToken])
def list_links(proposal_id: UUID, client: ScopedClient, _: Staff):
    try:
        result = (
            client.table("proposal_link_tokens")
            .select("*")
            .eq("proposal_id", str(proposal_id))
            .order("created_at", desc=True)
            .execute()
        )
    except APIError as exc:
        _raise_for_postgrest(exc)
    return result.data


@router.post(
    "/proposals/{proposal_id}/links", response_model=ProposalLinkToken, status_code=status.HTTP_201_CREATED
)
def create_link(proposal_id: UUID, client: ScopedClient, _: Staff):
    body = {
        "proposal_id": str(proposal_id),
        "token": generate_token(),
        "expires_at": default_expiry().isoformat(),
    }
    try:
        result = client.table("proposal_link_tokens").insert(body).execute()
    except APIError as exc:
        _raise_for_postgrest(exc)
    return result.data[0]


@router.post("/proposals/{proposal_id}/links/{token_id}/revoke", response_model=ProposalLinkToken)
def revoke_link(proposal_id: UUID, token_id: UUID, client: ScopedClient, _: Staff):
    try:
        result = (
            client.table("proposal_link_tokens")
            .update({"revoked": True})
            .eq("id", str(token_id))
            .eq("proposal_id", str(proposal_id))
            .execute()
        )
    except APIError as exc:
        _raise_for_postgrest(exc)
    if not result.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Link token not found")
    return result.data[0]
