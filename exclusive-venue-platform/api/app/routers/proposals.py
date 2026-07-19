"""Proposal builder CRUD (task G1): proposals, proposal_venues, and
shareable link tokens. Same RLS-scoped pattern as venues.py/enquiries.py —
Postgres RLS is the actual authority. The public, token-based read path
lives in routers/public_proposals.py, not here (anon has no RLS policy on
these tables at all).
"""

from datetime import UTC, date, datetime
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
    # Version within the enquiry: next after the highest existing (v1, v2, …).
    existing = (
        client.table("proposals")
        .select("version")
        .eq("enquiry_id", str(payload.enquiry_id))
        .order("version", desc=True)
        .limit(1)
        .execute()
    )
    next_version = (existing.data[0]["version"] + 1) if existing.data else 1

    body = {
        **payload.model_dump(mode="json", exclude_none=True),
        "created_by": staff.user_id,
        "version": next_version,
    }
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


SERVICE_FEE_PCT = 12  # EVA Service Fee — must match app/services/proposal_pdf.py.
_OWNER_ROLES = {
    "Crystal Lam": "Account Director",
    "Henry Wong": "Senior Account Manager",
    "Sammi Chiu": "GM",
    "Saoud Maherzi": "Chairman",
}
_COUNT_WORDS = {1: "one", 2: "two", 3: "three", 4: "four", 5: "five"}


def _as_date(value) -> date | None:
    if not value:
        return None
    return value if isinstance(value, date) else datetime.fromisoformat(str(value)).date()


def _fmt_date(value, weekday: bool = False) -> str | None:
    d = _as_date(value)
    if d is None:
        return None
    return f"{d.strftime('%a ') if weekday else ''}{d.day} {d.strftime('%b %Y')}".strip()


def _proposal_context(client: Client, proposal: dict) -> dict:
    """Gather everything the detailed proposal document needs (task G4):
    client/contact/owner, the full brief, and each venue with photos (signed),
    amenities, config capacity, pricing-rule hours, and the priced breakdown
    incl. the EVA service fee. Consumed by render_proposal_html."""
    brief = client.table("briefs").select("*").eq("id", proposal["brief_id"]).execute().data[0]

    contact_name = None
    org_name = None
    region = None
    owner = None
    captured = None
    enquiry = client.table("enquiries").select("*").eq("id", proposal["enquiry_id"]).execute().data
    if enquiry:
        owner = enquiry[0].get("forwarded_to")
        captured = enquiry[0].get("created_at")
        if enquiry[0].get("contact_id"):
            contact = (
                client.table("contacts").select("*").eq("id", enquiry[0]["contact_id"]).execute().data
            )
            if contact:
                contact_name = contact[0]["full_name"]
                if contact[0].get("organisation_id"):
                    org = (
                        client.table("organisations")
                        .select("name, region")
                        .eq("id", contact[0]["organisation_id"])
                        .execute()
                        .data
                    )
                    if org:
                        org_name = org[0]["name"]
                        region = org[0].get("region")

    client_name = org_name or contact_name or "Client"
    reqs = brief.get("requirements") or {}
    format_needs = reqs.get("format_needs") or []
    tech_needs = reqs.get("tech_needs") or []
    mood = reqs.get("mood") or []

    start, end = brief.get("date_window_start"), brief.get("date_window_end")
    window_str = _fmt_date(start) if not end or end == start else f"{_fmt_date(start)} – {_fmt_date(end)}"
    tod = brief.get("time_of_day")
    duration_label = " · ".join(
        filter(None, [f"{brief['duration_hours']:g} hours" if brief.get("duration_hours") else None, tod])
    )

    if brief.get("budget_amount"):
        basis = " / head" if brief.get("budget_basis") == "per_head" else ""
        budget = f"HK$ {float(brief['budget_amount']):,.0f}{basis}"
    elif brief.get("budget_status") == "tbc" and brief.get("budget_estimate_low"):
        lo, hi = float(brief["budget_estimate_low"]), float(brief["budget_estimate_high"])
        budget = f"TBC · est. HK$ {lo:,.0f}–{hi:,.0f}"
    elif brief.get("budget_status") == "tbc":
        budget = "TBC"
    else:
        budget = None

    guests = brief.get("guest_count")
    event_type = brief.get("event_type")
    headline = (
        f"{guests} guests, {brief['duration_hours']:g} hours, one impression"
        if guests and brief.get("duration_hours")
        else (event_type or "A considered proposal")
    )

    def _rows(pairs):
        return [(k, v) for k, v in pairs if v]

    brief_meta = _rows([
        ("Format", event_type),
        ("Guests", f"{guests} pax" if guests else None),
        ("Date", window_str),
        ("Duration", duration_label),
        ("Format needs", " · ".join(format_needs)),
        ("Mood", " · ".join(mood)),
    ])
    enquiry_rows = _rows([
        ("Contact", contact_name),
        ("Maison", org_name),
        ("Project", event_type),
        ("Window", " · ".join(filter(None, [window_str, tod]))),
        ("Headcount", f"{guests} pax confirmed" if guests else None),
        ("Catering", brief.get("catering")),
        ("AV needs", " · ".join(tech_needs)),
        ("Decision by", _fmt_date(brief.get("decision_by"))),
        ("Budget signal", budget),
    ])

    pvs = (
        client.table("proposal_venues")
        .select("*")
        .eq("proposal_id", proposal["id"])
        .order("sort_order")
        .execute()
        .data
    )
    venues = []
    for i, pv in enumerate(pvs, start=1):
        venue = client.table("venues").select("*").eq("id", pv["venue_id"]).execute().data[0]
        config = (
            client.table("venue_configurations")
            .select("capacity, name")
            .eq("id", pv["configuration_id"])
            .execute()
            .data
        )
        capacity = config[0]["capacity"] if config else None
        rule = (
            client.table("pricing_rules")
            .select("duration_multipliers")
            .eq("id", pv["pricing_rules_id"])
            .execute()
            .data
        )
        included_hours = (rule[0].get("duration_multipliers") or {}).get("included_hours") if rule else None

        media = (
            client.table("venue_media")
            .select("storage_path")
            .eq("venue_id", pv["venue_id"])
            .order("sort_order")
            .execute()
            .data
        )
        url_map = storage.signed_urls([m["storage_path"] for m in media])
        image = next((url_map[m["storage_path"]] for m in media if m["storage_path"] in url_map), None)

        subtotal = float(pv.get("quote_total") or 0)
        fee = round(subtotal * SERVICE_FEE_PCT / 100)
        total = subtotal + fee
        hours = brief.get("duration_hours") or included_hours or 1
        rate_per_hr = round(subtotal / hours) if hours else subtotal

        qb = pv.get("quote_breakdown") or {}
        season_mult = qb.get("season_adjustment_multiplier") or 1
        season_label = "Peak season" if season_mult and float(season_mult) > 1 else "Standard season"

        amenities = []
        if capacity:
            amenities.append(f"to {capacity} standing")
        if included_hours:
            amenities.append(f"{included_hours:g}hr access")
        amenities += list(venue.get("amenities") or [])

        venues.append({
            "index": i,
            "name": venue["name"],
            "location_line": venue.get("district") or "—",
            "description": venue.get("description"),
            "image": image,
            "amenities": amenities,
            "meta_line": " · ".join(
                filter(
                    None,
                    [
                        f"{guests} pax" if guests else None,
                        f"{hours:g} hrs",
                        _fmt_date(start, weekday=True),
                        season_label,
                    ],
                )
            ),
            "rate_per_hr": rate_per_hr,
            "hours": f"{hours:g}",
            "hours_label": (
                f"× {hours:g} hours · {'full-day access' if hours >= 10 else 'standard day access'}"
            ),
            "subtotal": subtotal,
            "fee": fee,
            "total": total,
            "recommended": pv.get("recommended"),
        })

    return {
        "proposal_ref": f"#{proposal['id'][:4].upper()}",
        "version": proposal.get("version", 1),
        "currency": proposal.get("currency", "HKD"),
        "client_name": client_name,
        "contact_name": contact_name,
        "owner_name": owner or "Your Exclusive Venue manager",
        "owner_first": (owner or "Your manager").split()[0],
        "owner_role": _OWNER_ROLES.get(owner, "Account manager"),
        "region": region or "Hong Kong",
        "event_title": event_type or "Event Proposal",
        "headline": headline,
        "intro_copy": proposal.get("intro_copy"),
        "captured_date": _fmt_date(captured),
        "window_str": window_str,
        "brief_meta": brief_meta,
        "enquiry_rows": enquiry_rows,
        "option_count_word": _COUNT_WORDS.get(len(venues), str(len(venues))),
        "venues": venues,
    }


@router.get("/proposals/{proposal_id}/pdf")
def proposal_pdf(proposal_id: UUID, client: ScopedClient, _: Staff):
    """Branded proposal as a downloadable PDF (task G4). Rendered server-side
    with Chromium (app/services/proposal_pdf.py) so it's true to the design —
    the same HTML the operator previews, minus the app chrome."""
    proposal = _get_proposal_or_404(client, proposal_id)
    context = _proposal_context(client, proposal)
    pdf = proposal_pdf_bytes(render_proposal_html(context))
    filename = f"Proposal_{context['proposal_ref'].lstrip('#')}.pdf"
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/proposals/{proposal_id}/preview-html")
def proposal_preview_html(proposal_id: UUID, client: ScopedClient, _: Staff):
    """The exact HTML the PDF is rendered from — shown in the builder's preview
    iframe so preview and PDF are one source of truth (never drift)."""
    proposal = _get_proposal_or_404(client, proposal_id)
    return Response(content=render_proposal_html(_proposal_context(client, proposal)), media_type="text/html")


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
