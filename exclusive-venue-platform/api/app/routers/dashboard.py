"""Dashboard summary (Workspace > Dashboard). One consolidated read per
role rather than the frontend looping over /enquiries, /proposals, /venues
and reducing client-side — avoids reintroducing the N+1 pattern already
found live twice in this codebase (see enquiries.py, brief embed comment)
and keeps company-wide revenue numbers off the wire for non-admin staff.

Revenue attribution: an accepted proposal can carry multiple venue
options (client comparison), and nothing in the schema records which one
was actually booked (see erd.md §5 — proposal_venues has no "chosen"
flag, only "recommended"). Rather than guess, revenue is only counted
for an accepted proposal when it's unambiguous: exactly one venue option,
or exactly one marked `recommended`. Proposals left ambiguous are
excluded from revenue/leaderboard/venue-performance numbers entirely
(counted, never estimated) — see `_resolve_revenue` below.

Admin-only sections (revenue trend, leaderboard, venue performance,
workload) are skipped at the query level for non-admin staff, not merely
hidden by the frontend: proposals_staff_all (migration 0006) is still the
coarse "any staff sees everything" policy — enquiries got the per-owner
RLS rewrite (migration 0022), proposals didn't. Until that gap closes,
this endpoint scopes proposals to the caller's own enquiries in Python
for staff (see `_scope_proposals_to_self`) rather than trusting Postgres
to, and gates the cross-staff comparison sections to admin outright.
"""

from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from typing import Annotated

from fastapi import APIRouter, Depends
from postgrest.exceptions import APIError
from supabase import Client

from app.core.auth import StaffUser, require_staff_session
from app.core.scoped_client import get_scoped_client
from app.schemas.dashboard import (
    AgingDeal,
    ChannelCount,
    DashboardKpis,
    DashboardSummary,
    FunnelStage,
    LeaderboardRow,
    LostReasonCount,
    ProposalStatusCount,
    RevenueMonth,
    UpcomingBooking,
    VenuePerformanceRow,
    WorkloadRow,
)
from app.services.stage_machine import STAGE_TO_STATUS

router = APIRouter(prefix="/dashboard", tags=["dashboard"])

ScopedClient = Annotated[Client, Depends(get_scoped_client)]
Staff = Annotated[StaffUser, Depends(require_staff_session)]

UPCOMING_WINDOW_DAYS = 14
STUCK_AFTER_DAYS = 14
MAX_AGING_DEALS = 20  # longest-stuck first; capped so the endpoint stays cheap to render

FUNNEL_STAGES = [
    ("enquiry", "Enquiry"),
    ("briefed", "Briefed"),
    ("proposed", "Proposed"),
    ("held", "Held"),
    ("signed", "Signed"),
]
STAGE_RANK = {stage: i for i, (stage, _label) in enumerate(FUNNEL_STAGES)}


def _get_role(client: Client, user_id: str) -> str:
    result = client.table("user_roles").select("role").eq("user_id", user_id).execute()
    return "admin" if any(r["role"] == "admin" for r in result.data) else "staff"


def _latest_brief(briefs: list[dict]) -> dict | None:
    if not briefs:
        return None
    return max(briefs, key=lambda b: b["version"])


def _parse_dt(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def _resolve_revenue(venues: list[dict]) -> float | None:
    """Returns the quote_total actually attributable to a booking, or
    None if which venue was booked can't be determined unambiguously."""
    if len(venues) == 1:
        return float(venues[0]["quote_total"])
    recommended = [v for v in venues if v.get("recommended")]
    if len(recommended) == 1:
        return float(recommended[0]["quote_total"])
    return None


def _resolve_venue_id(venues: list[dict]) -> str | None:
    if len(venues) == 1:
        return venues[0]["venue_id"]
    recommended = [v for v in venues if v.get("recommended")]
    return recommended[0]["venue_id"] if len(recommended) == 1 else None


@router.get("", response_model=DashboardSummary)
def get_dashboard(client: ScopedClient, staff: Staff):
    role = _get_role(client, staff.user_id)
    is_admin = role == "admin"

    try:
        enquiry_rows = client.table("enquiries").select("*, briefs(*)").execute().data
    except APIError:
        enquiry_rows = []

    now = datetime.utcnow()  # matches parsed timestamps below (stored/returned in UTC)
    this_month = (now.year, now.month)

    open_count = awaiting_count = won_this_month = lost_this_month = 0
    won_total = lost_total = 0
    pipeline_value = 0.0
    channel_counts: dict[str, int] = defaultdict(int)
    funnel_counts = {stage: 0 for stage, _ in FUNNEL_STAGES}
    lost_reason_counts: dict[str, int] = defaultdict(int)
    aging_deals: list[AgingDeal] = []

    for row in enquiry_rows:
        stage = row["stage"]
        status = STAGE_TO_STATUS.get(stage, "open")
        channel_counts[row["channel"]] += 1

        if status == "open":
            open_count += 1
        elif status == "awaiting":
            awaiting_count += 1

        if stage != "lost":
            rank = STAGE_RANK.get(stage)
            if rank is not None:
                for i, (s, _label) in enumerate(FUNNEL_STAGES):
                    if i <= rank:
                        funnel_counts[s] += 1

        if status in ("open", "awaiting"):
            brief = _latest_brief(row.get("briefs") or [])
            if brief and brief.get("budget_amount"):
                pipeline_value += float(brief["budget_amount"])

        updated_at = row.get("updated_at")
        updated_month = None
        days_since_update = None
        if updated_at:
            parsed = _parse_dt(updated_at)
            updated_month = (parsed.year, parsed.month)
            days_since_update = (now - parsed.astimezone(timezone.utc).replace(tzinfo=None)).days

        if stage == "signed":
            won_total += 1
            if updated_month == this_month:
                won_this_month += 1
        elif stage == "lost":
            lost_total += 1
            if updated_month == this_month:
                lost_this_month += 1
            lost_reason_counts[row.get("lost_reason") or "Not specified"] += 1

        if status in ("open", "awaiting") and days_since_update is not None and days_since_update >= STUCK_AFTER_DAYS:
            summary = (row.get("raw_content") or "").strip().replace("\n", " ")
            aging_deals.append(
                AgingDeal(
                    enquiry_id=row["id"],
                    summary=summary[:80] + ("…" if len(summary) > 80 else ""),
                    stage=stage,
                    days_stuck=days_since_update,
                    assigned_to_name=None,  # filled in below for admin
                )
            )

    win_rate_pct = (
        round(won_total / (won_total + lost_total) * 100, 1) if (won_total + lost_total) > 0 else None
    )

    kpis = DashboardKpis(
        open_count=open_count,
        awaiting_count=awaiting_count,
        won_this_month=won_this_month,
        lost_this_month=lost_this_month,
        win_rate_pct=win_rate_pct,
        pipeline_value=pipeline_value,
        currency="HKD",
        total_enquiries=len(enquiry_rows),
        total_lost=lost_total,
    )
    funnel = [FunnelStage(stage=s, label=label, count=funnel_counts[s]) for s, label in FUNNEL_STAGES]
    channel_breakdown = [ChannelCount(channel=c, count=n) for c, n in channel_counts.items()]
    lost_reasons = sorted(
        (LostReasonCount(reason=r, count=n) for r, n in lost_reason_counts.items()),
        key=lambda x: x.count,
        reverse=True,
    )
    aging_deals.sort(key=lambda d: d.days_stuck, reverse=True)
    aging_deals = aging_deals[:MAX_AGING_DEALS]

    # --- staff directory (admin only — used for aging-deal attribution,
    # leaderboard, and workload) ------------------------------------------
    staff_names: dict[str, str] = {}
    enquiry_by_id = {row["id"]: row for row in enquiry_rows}
    if is_admin:
        assignee_ids = {row["assigned_to"] for row in enquiry_rows if row.get("assigned_to")}
        if assignee_ids:
            try:
                staff_names = {
                    p["id"]: p["full_name"]
                    for p in client.table("profiles").select("id, full_name").in_("id", list(assignee_ids)).execute().data
                }
            except APIError:
                staff_names = {}
        for deal in aging_deals:
            enquiry = enquiry_by_id.get(deal.enquiry_id)
            assigned_to = enquiry.get("assigned_to") if enquiry else None
            deal.assigned_to_name = staff_names.get(assigned_to) if assigned_to else None

    workload: list[WorkloadRow] = []
    if is_admin:
        workload_counts: dict[str, list[int]] = defaultdict(lambda: [0, 0])
        for row in enquiry_rows:
            assigned_to = row.get("assigned_to")
            status = STAGE_TO_STATUS.get(row["stage"], "open")
            if not assigned_to or status not in ("open", "awaiting"):
                continue
            counts = workload_counts[assigned_to]
            if status == "open":
                counts[0] += 1
            else:
                counts[1] += 1
        workload = sorted(
            (
                WorkloadRow(staff_name=staff_names.get(uid, "Unknown"), open_count=o, awaiting_count=a)
                for uid, (o, a) in workload_counts.items()
            ),
            key=lambda r: r.open_count + r.awaiting_count,
            reverse=True,
        )

    # --- proposals: fetched once, unfiltered, then scoped in Python for
    # staff (proposals RLS doesn't scope by owner — see module docstring)
    today = date.today()
    window_end = today + timedelta(days=UPCOMING_WINDOW_DAYS)

    try:
        all_proposal_rows = (
            client.table("proposals")
            .select("id, enquiry_id, title, status, event_date, updated_at, proposal_venues(quote_total, recommended, venue_id)")
            .execute()
            .data
        )
    except APIError:
        all_proposal_rows = []

    if is_admin:
        proposal_rows = all_proposal_rows
    else:
        proposal_rows = [
            row
            for row in all_proposal_rows
            if (enquiry_by_id.get(row["enquiry_id"]) or {}).get("assigned_to") == staff.user_id
        ]

    proposal_status_counts: dict[str, int] = defaultdict(int)
    for row in proposal_rows:
        proposal_status_counts[row["status"]] += 1
    proposal_funnel = [
        ProposalStatusCount(status=s, count=n) for s, n in proposal_status_counts.items()
    ]

    venue_names: dict[str, str] = {}
    if proposal_rows:
        try:
            venue_names = {v["id"]: v["name"] for v in client.table("venues").select("id, name").execute().data}
        except APIError:
            venue_names = {}

    accepted_rows = [row for row in proposal_rows if row["status"] == "accepted"]

    upcoming_bookings: list[UpcomingBooking] = []
    revenue_by_month: dict[str, float] = defaultdict(float)
    revenue_by_staff: dict[str, tuple[int, float]] = {}
    revenue_by_venue: dict[str, tuple[int, float]] = {}

    for row in accepted_rows:
        venues = row.get("proposal_venues") or []
        event_date = row.get("event_date")

        if event_date and today.isoformat() <= event_date <= window_end.isoformat():
            primary_venue = venues[0] if venues else None
            venue_name = venue_names.get(primary_venue["venue_id"], "—") if primary_venue else "—"
            upcoming_bookings.append(
                UpcomingBooking(
                    proposal_id=row["id"],
                    title=row["title"],
                    venue_name=venue_name,
                    event_date=event_date,
                )
            )

        if not is_admin:
            continue

        revenue = _resolve_revenue(venues)
        if revenue is None:
            continue

        updated_at = row.get("updated_at")
        if updated_at:
            parsed = _parse_dt(updated_at)
            month_key = f"{parsed.year:04d}-{parsed.month:02d}"
            revenue_by_month[month_key] += revenue

        enquiry = enquiry_by_id.get(row["enquiry_id"])
        assigned_to = enquiry.get("assigned_to") if enquiry else None
        if assigned_to:
            count, total = revenue_by_staff.get(assigned_to, (0, 0.0))
            revenue_by_staff[assigned_to] = (count + 1, total + revenue)

        resolved_venue_id = _resolve_venue_id(venues)
        if resolved_venue_id:
            count, total = revenue_by_venue.get(resolved_venue_id, (0, 0.0))
            revenue_by_venue[resolved_venue_id] = (count + 1, total + revenue)

    upcoming_bookings.sort(key=lambda b: b.event_date)

    revenue_trend: list[RevenueMonth] = []
    leaderboard: list[LeaderboardRow] = []
    venue_performance: list[VenuePerformanceRow] = []

    if is_admin:
        revenue_trend = [
            RevenueMonth(month=m, revenue=amount) for m, amount in sorted(revenue_by_month.items())
        ]

        # revenue_by_staff may reference assignees not already covered by
        # the aging/workload staff_names lookup (e.g. someone with signed
        # deals but no current open/awaiting enquiries) — top up the dict.
        missing_ids = [uid for uid in revenue_by_staff if uid not in staff_names]
        if missing_ids:
            try:
                staff_names.update(
                    {
                        p["id"]: p["full_name"]
                        for p in client.table("profiles").select("id, full_name").in_("id", missing_ids).execute().data
                    }
                )
            except APIError:
                pass

        leaderboard = sorted(
            (
                LeaderboardRow(staff_name=staff_names.get(uid, "Unknown"), won_count=count, revenue=total)
                for uid, (count, total) in revenue_by_staff.items()
            ),
            key=lambda r: r.revenue,
            reverse=True,
        )

        venue_performance = sorted(
            (
                VenuePerformanceRow(venue_name=venue_names.get(vid, "—"), booking_count=count, revenue=total)
                for vid, (count, total) in revenue_by_venue.items()
            ),
            key=lambda r: r.revenue,
            reverse=True,
        )

    return DashboardSummary(
        role=role,
        kpis=kpis,
        funnel=funnel,
        channel_breakdown=channel_breakdown,
        upcoming_bookings=upcoming_bookings,
        lost_reasons=lost_reasons,
        aging_deals=aging_deals,
        proposal_funnel=proposal_funnel,
        revenue_trend=revenue_trend,
        leaderboard=leaderboard,
        venue_performance=venue_performance,
        workload=workload,
    )
