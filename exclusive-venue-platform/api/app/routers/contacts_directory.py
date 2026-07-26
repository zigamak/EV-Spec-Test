"""Contacts directory support (task, 19 Jul): per-organisation and
per-contact summaries plus the "Conversation timeline" (client reference,
19 Jul) — every real touchpoint (enquiry received, brief parsed, proposal
sent/won, misc activity) merged into one chronological feed. Everything
here is computed at query time from tables that already exist:
enquiries.raw_content is the actual received message, briefs carries the
real structured fields (event_type/guest_count/date window/mood/budget),
proposals + proposal_venues gives real venues/pricing, and activity_log
(task K1) already exists for exactly this purpose. Nothing here is a
stored column, and nothing is invented where the data doesn't exist —
nothing plays the role of the reference's fabricated tracking-pixel
opens count or feedback-quote text.
"""

from typing import Annotated, Any, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from postgrest.exceptions import APIError
from pydantic import BaseModel
from supabase import Client

from app.core.auth import StaffUser, require_staff_session
from app.core.scoped_client import get_scoped_client
from app.schemas.enquiry import Contact, Organisation

router = APIRouter(tags=["contacts-directory"])

ScopedClient = Annotated[Client, Depends(get_scoped_client)]
Staff = Annotated[StaffUser, Depends(require_staff_session)]

# Proposal statuses that count as "still awaiting a decision" for the
# open-proposals stat and "sent" for the win-rate denominator — mirrors
# the send/view/accept mechanics in schemas/proposal.py's ProposalStatus.
OPEN_PROPOSAL_STATUSES = {"draft", "pending_approval", "sent", "viewed"}
SENT_PROPOSAL_STATUSES = {"sent", "viewed", "accepted", "declined"}


def _raise_for_postgrest(exc: APIError) -> None:
    code = (exc.code or "").upper()
    if code in {"42501", "PGRST301"}:
        raise HTTPException(status.HTTP_403_FORBIDDEN, exc.message) from exc
    raise HTTPException(status.HTTP_400_BAD_REQUEST, exc.message) from exc


class DealStats(BaseModel):
    enquiry_count: int
    signed_count: int
    total_revenue: float
    currency: str | None
    last_contact_at: str | None
    proposal_count: int
    open_proposal_count: int
    # Percentage (0-100), null when no proposal has ever been sent — a
    # rate over zero attempts isn't zero, it's undefined.
    win_rate: float | None


def _deal_stats(client: Client, contact_ids: list[str]) -> DealStats:
    empty = DealStats(
        enquiry_count=0,
        signed_count=0,
        total_revenue=0.0,
        currency=None,
        last_contact_at=None,
        proposal_count=0,
        open_proposal_count=0,
        win_rate=None,
    )
    if not contact_ids:
        return empty

    try:
        enquiries = (
            client.table("enquiries")
            .select("id, stage, created_at")
            .in_("contact_id", contact_ids)
            .execute()
        )
    except APIError as exc:
        _raise_for_postgrest(exc)

    rows = enquiries.data
    if not rows:
        return empty
    enquiry_ids = [r["id"] for r in rows]
    signed_ids = {r["id"] for r in rows if r["stage"] == "signed"}
    last_contact_at = max((r["created_at"] for r in rows), default=None)

    try:
        proposals = (
            client.table("proposals").select("id, enquiry_id, status, currency").in_("enquiry_id", enquiry_ids).execute()  # noqa: E501
        )
    except APIError as exc:
        _raise_for_postgrest(exc)

    proposal_rows = proposals.data
    proposal_count = len(proposal_rows)
    open_proposal_count = sum(1 for p in proposal_rows if p["status"] in OPEN_PROPOSAL_STATUSES)
    sent_count = sum(1 for p in proposal_rows if p["status"] in SENT_PROPOSAL_STATUSES)
    win_rate = (len(signed_ids) / sent_count * 100) if sent_count else None
    currency = proposal_rows[0]["currency"] if proposal_rows else None

    total_revenue = 0.0
    signed_proposal_ids = [p["id"] for p in proposal_rows if p["enquiry_id"] in signed_ids]
    if signed_proposal_ids:
        try:
            venues = client.table("proposal_venues").select("quote_total").in_("proposal_id", signed_proposal_ids).execute()  # noqa: E501
        except APIError as exc:
            _raise_for_postgrest(exc)
        total_revenue = sum(v["quote_total"] for v in venues.data)

    return DealStats(
        enquiry_count=len(rows),
        signed_count=len(signed_ids),
        total_revenue=total_revenue,
        currency=currency,
        last_contact_at=last_contact_at,
        proposal_count=proposal_count,
        open_proposal_count=open_proposal_count,
        win_rate=win_rate,
    )


class OrganisationSummary(BaseModel):
    organisation: Organisation
    contacts: list[Contact]
    stats: DealStats
    # Computed, not stored (same pattern as tier/lifetime value): true only
    # when there's at least one contact on file and every single one of
    # them arrived via automatic intake — never manually entered. Powers
    # the reference's "auto-imported" badge without inventing a column for
    # something that's really just a fact about the existing contacts.
    auto_imported: bool


def _get_org_and_contacts(client: Client, organisation_id: UUID) -> tuple[dict, list[dict]]:
    try:
        org_result = client.table("organisations").select("*").eq("id", str(organisation_id)).execute()
    except APIError as exc:
        _raise_for_postgrest(exc)
    if not org_result.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Organisation not found")

    try:
        contacts_result = (
            client.table("contacts")
            .select("*")
            .eq("organisation_id", str(organisation_id))
            .order("full_name")
            .execute()
        )
    except APIError as exc:
        _raise_for_postgrest(exc)
    return org_result.data[0], contacts_result.data


def _build_organisation_summary(
    client: Client, organisation_id: UUID
) -> tuple[OrganisationSummary, dict, list[dict]]:
    org, contacts = _get_org_and_contacts(client, organisation_id)
    contact_ids = [c["id"] for c in contacts]
    stats = _deal_stats(client, contact_ids)
    auto_imported = bool(contacts) and all(c["source"] != "manual" for c in contacts)
    summary = OrganisationSummary(organisation=org, contacts=contacts, stats=stats, auto_imported=auto_imported)
    return summary, org, contacts


@router.get("/organisations/{organisation_id}/summary", response_model=OrganisationSummary)
def get_organisation_summary(organisation_id: UUID, client: ScopedClient, _: Staff):
    summary, _org, _contacts = _build_organisation_summary(client, organisation_id)
    return summary


class ContactSummary(BaseModel):
    contact: Contact
    organisation: Organisation | None
    stats: DealStats


def _build_contact_summary(client: Client, contact_id: UUID) -> tuple[ContactSummary, dict]:
    try:
        contact_result = client.table("contacts").select("*").eq("id", str(contact_id)).execute()
    except APIError as exc:
        _raise_for_postgrest(exc)
    if not contact_result.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Contact not found")
    contact = contact_result.data[0]

    organisation = None
    if contact.get("organisation_id"):
        try:
            org_result = (
                client.table("organisations").select("*").eq("id", contact["organisation_id"]).execute()
            )
        except APIError as exc:
            _raise_for_postgrest(exc)
        organisation = org_result.data[0] if org_result.data else None

    stats = _deal_stats(client, [str(contact_id)])
    return ContactSummary(contact=contact, organisation=organisation, stats=stats), contact


@router.get("/contacts/{contact_id}/summary", response_model=ContactSummary)
def get_contact_summary(contact_id: UUID, client: ScopedClient, _: Staff):
    summary, _contact = _build_contact_summary(client, contact_id)
    return summary


# --- Conversation timeline ---------------------------------------------

TimelineType = Literal[
    "onboarded", "enquiry_received", "brief_parsed", "proposal_sent", "proposal_won", "proposal_declined", "activity"  # noqa: E501
]
TimelineCategory = Literal["system", "email", "proposal", "event"]


class TimelineEntry(BaseModel):
    id: str
    type: TimelineType
    category: TimelineCategory
    timestamp: str
    label: str
    title: str
    contact_name: str | None = None
    contact_email: str | None = None
    body: str | None = None
    fields: dict[str, str] | None = None
    venues: list[str] | None = None
    price_low: float | None = None
    price_high: float | None = None
    currency: str | None = None
    enquiry_id: str | None = None
    proposal_id: str | None = None


def _brief_fields(brief: dict[str, Any]) -> dict[str, str]:
    fields: dict[str, str] = {}
    if brief.get("event_type"):
        fields["Event"] = brief["event_type"]
    if brief.get("guest_count"):
        fields["Guests"] = f"{brief['guest_count']} pax"
    if brief.get("date_window_start"):
        window = brief["date_window_start"]
        if brief.get("date_window_end") and brief["date_window_end"] != window:
            window = f"{window} – {brief['date_window_end']}"
        fields["Date"] = window
    if brief.get("duration_hours"):
        fields["Duration"] = f"{brief['duration_hours']}h" + (f" · {brief['time_of_day']}" if brief.get("time_of_day") else "")  # noqa: E501
    mood = (brief.get("requirements") or {}).get("mood")
    if mood:
        fields["Mood"] = " · ".join(mood) if isinstance(mood, list) else str(mood)
    if brief.get("budget_status") == "tbc":
        low, high = brief.get("budget_estimate_low"), brief.get("budget_estimate_high")
        fields["Budget"] = f"TBC · est. {int(low):,}–{int(high):,}" if low and high else "TBC"
    elif brief.get("budget_amount"):
        fields["Budget"] = f"{int(brief['budget_amount']):,}" + (" per head" if brief.get("budget_basis") == "per_head" else "")  # noqa: E501
    return fields


def _organisation_timeline(client: Client, org: dict, contacts: list[dict]) -> list[TimelineEntry]:
    contact_by_id = {c["id"]: c for c in contacts}
    contact_ids = list(contact_by_id)

    entries: list[TimelineEntry] = [
        TimelineEntry(
            id=f"onboarded-{org['id']}",
            type="onboarded",
            category="system",
            timestamp=org["created_at"],
            label="Client onboarded",
            title=f"{org['name']} added to roster",
            body=org.get("notes"),
        )
    ]
    if not contact_ids:
        return entries

    try:
        enquiries = (
            client.table("enquiries")
            .select("*, briefs(*)")
            .in_("contact_id", contact_ids)
            .execute()
        )
    except APIError as exc:
        _raise_for_postgrest(exc)
    enquiry_by_id = {e["id"]: e for e in enquiries.data}

    for e in enquiries.data:
        contact = contact_by_id.get(e["contact_id"])
        entries.append(
            TimelineEntry(
                id=f"enquiry-{e['id']}",
                type="enquiry_received",
                category="email",
                timestamp=e["created_at"],
                label=f"Enquiry received · {e['channel']}",
                title=(e["briefs"] and max(e["briefs"], key=lambda b: b["version"])["event_type"]) or "New enquiry",  # noqa: E501
                contact_name=contact["full_name"] if contact else None,
                contact_email=contact["email"] if contact else None,
                body=e["raw_content"][:800],
                enquiry_id=e["id"],
            )
        )
        if e["briefs"]:
            latest_brief = max(e["briefs"], key=lambda b: b["version"])
            entries.append(
                TimelineEntry(
                    id=f"brief-{latest_brief['id']}",
                    type="brief_parsed",
                    category="email",
                    timestamp=latest_brief["created_at"],
                    label=f"Concierge briefing · {len(latest_brief.get('flagged_fields') or [])} flagged"
                    if latest_brief.get("flagged_fields")
                    else "Concierge briefing",
                    title=f"Structured brief — {latest_brief['confidence'] * 100:.0f}% confidence",
                    fields=_brief_fields(latest_brief),
                    enquiry_id=e["id"],
                )
            )

    enquiry_ids = list(enquiry_by_id)
    if enquiry_ids:
        try:
            proposals = client.table("proposals").select("*").in_("enquiry_id", enquiry_ids).execute()
        except APIError as exc:
            _raise_for_postgrest(exc)
        proposal_rows = proposals.data
        proposal_ids = [p["id"] for p in proposal_rows]

        pv_by_proposal: dict[str, list[dict]] = {}
        venue_name_by_id: dict[str, str] = {}
        if proposal_ids:
            try:
                pvs = client.table("proposal_venues").select("*").in_("proposal_id", proposal_ids).execute()
            except APIError as exc:
                _raise_for_postgrest(exc)
            for pv in pvs.data:
                pv_by_proposal.setdefault(pv["proposal_id"], []).append(pv)
            venue_ids = list({pv["venue_id"] for pv in pvs.data})
            if venue_ids:
                try:
                    venue_rows = client.table("venues").select("id, name").in_("id", venue_ids).execute()
                except APIError as exc:
                    _raise_for_postgrest(exc)
                venue_name_by_id = {v["id"]: v["name"] for v in venue_rows.data}

        for p in proposal_rows:
            enquiry = enquiry_by_id.get(p["enquiry_id"])
            contact = contact_by_id.get(enquiry["contact_id"]) if enquiry else None
            pv_list = pv_by_proposal.get(p["id"], [])
            venue_names = [venue_name_by_id[pv["venue_id"]] for pv in pv_list if pv["venue_id"] in venue_name_by_id]  # noqa: E501
            totals = [pv["quote_total"] for pv in pv_list]

            if p.get("sent_at"):
                entries.append(
                    TimelineEntry(
                        id=f"proposal-sent-{p['id']}",
                        type="proposal_sent",
                        category="proposal",
                        timestamp=p["sent_at"],
                        label="Proposal sent",
                        title=p["title"],
                        contact_name=contact["full_name"] if contact else None,
                        contact_email=contact["email"] if contact else None,
                        body=p.get("personal_email_copy") or p.get("intro_copy"),
                        venues=venue_names or None,
                        price_low=min(totals) if totals else None,
                        price_high=max(totals) if totals else None,
                        currency=p["currency"],
                        proposal_id=p["id"],
                        enquiry_id=p["enquiry_id"],
                    )
                )
            if p["status"] == "accepted":
                entries.append(
                    TimelineEntry(
                        id=f"proposal-won-{p['id']}",
                        type="proposal_won",
                        category="event",
                        # No dedicated accepted_at column — updated_at is the
                        # best real proxy for "when the status last changed".
                        timestamp=p["updated_at"],
                        label="Proposal · won",
                        title=p["title"],
                        venues=venue_names or None,
                        price_low=sum(totals) if totals else None,
                        currency=p["currency"],
                        proposal_id=p["id"],
                        enquiry_id=p["enquiry_id"],
                    )
                )
            elif p["status"] == "declined":
                entries.append(
                    TimelineEntry(
                        id=f"proposal-declined-{p['id']}",
                        type="proposal_declined",
                        category="proposal",
                        timestamp=p["updated_at"],
                        label="Proposal · declined",
                        title=p["title"],
                        proposal_id=p["id"],
                        enquiry_id=p["enquiry_id"],
                    )
                )

        try:
            activity = (
                client.table("activity_log")
                .select("*")
                .in_("enquiry_id", enquiry_ids)
                .not_.in_("action", ["brief.parsed", "proposal.created"])
                .execute()
            )
        except APIError as exc:
            _raise_for_postgrest(exc)
        for a in activity.data:
            entries.append(
                TimelineEntry(
                    id=f"activity-{a['id']}",
                    type="activity",
                    category="system",
                    timestamp=a["created_at"],
                    label=a["action"].replace(".", " · ").replace("_", " "),
                    title=a.get("summary") or a["action"],
                    enquiry_id=a.get("enquiry_id"),
                )
            )

    entries.sort(key=lambda e: e.timestamp, reverse=True)
    return entries


@router.get("/organisations/{organisation_id}/timeline", response_model=list[TimelineEntry])
def get_organisation_timeline(organisation_id: UUID, client: ScopedClient, _: Staff):
    org, contacts = _get_org_and_contacts(client, organisation_id)
    return _organisation_timeline(client, org, contacts)


@router.get("/contacts/{contact_id}/timeline", response_model=list[TimelineEntry])
def get_contact_timeline(contact_id: UUID, client: ScopedClient, _: Staff):
    try:
        contact_result = client.table("contacts").select("*").eq("id", str(contact_id)).execute()
    except APIError as exc:
        _raise_for_postgrest(exc)
    if not contact_result.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Contact not found")
    contact = contact_result.data[0]
    # Reuses the same aggregation as the organisation timeline, scoped to
    # this one contact — a synthetic "org" shell just carries the fields
    # the onboarded entry needs (name, created_at, notes).
    pseudo_org = {
        "id": f"contact-{contact['id']}",
        "name": contact["full_name"],
        "created_at": contact["created_at"],
        "notes": None,
    }
    return _organisation_timeline(client, pseudo_org, [contact])


# --- Combined endpoints (24 Jul perf pass) --------------------------------
#
# The directory page and its two detail panels each used to fire 2-3
# separate requests on load, each paying its own Supabase client TLS
# handshake (app/core/scoped_client.py deliberately rebuilds one per
# request rather than caching — see that file's docstring for why).
# These bundle the underlying queries behind one request/one client.


class ContactsDirectory(BaseModel):
    organisations: list[Organisation]
    contacts: list[Contact]


@router.get("/contacts-directory", response_model=ContactsDirectory)
def get_contacts_directory(client: ScopedClient, _: Staff):
    """Replaces the directory page's separate GET /organisations +
    GET /contacts calls."""
    try:
        orgs = client.table("organisations").select("*").order("name").execute()
        contacts = client.table("contacts").select("*").order("created_at", desc=True).execute()
    except APIError as exc:
        _raise_for_postgrest(exc)
    return ContactsDirectory(organisations=orgs.data, contacts=contacts.data)


class OrganisationDetail(BaseModel):
    summary: OrganisationSummary
    timeline: list[TimelineEntry]


@router.get("/organisations/{organisation_id}/detail", response_model=OrganisationDetail)
def get_organisation_detail(organisation_id: UUID, client: ScopedClient, _: Staff):
    """Replaces the org detail panel's separate .../summary + .../timeline
    calls."""
    summary, org, contacts = _build_organisation_summary(client, organisation_id)
    timeline = _organisation_timeline(client, org, contacts)
    return OrganisationDetail(summary=summary, timeline=timeline)


class ContactDetail(BaseModel):
    summary: ContactSummary
    timeline: list[TimelineEntry]


@router.get("/contacts/{contact_id}/detail", response_model=ContactDetail)
def get_contact_detail(contact_id: UUID, client: ScopedClient, _: Staff):
    """Replaces the contact detail panel's separate .../summary +
    .../timeline calls."""
    summary, contact = _build_contact_summary(client, contact_id)
    pseudo_org = {
        "id": f"contact-{contact['id']}",
        "name": contact["full_name"],
        "created_at": contact["created_at"],
        "notes": None,
    }
    timeline = _organisation_timeline(client, pseudo_org, [contact])
    return ContactDetail(summary=summary, timeline=timeline)
