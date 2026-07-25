"""Dashboard summary schema (Workspace > Dashboard). One aggregation
endpoint rather than the frontend fetching raw enquiries/proposals and
computing charts client-side — keeps the "never fabricate data" rule
enforceable in one place and avoids shipping company-wide revenue figures
to non-admin staff over the wire (see dashboard.py router for why that
matters given proposals' current RLS policy)."""

from pydantic import BaseModel


class DashboardKpis(BaseModel):
    open_count: int
    awaiting_count: int
    won_this_month: int
    lost_this_month: int
    win_rate_pct: float | None  # None when there's no terminal history yet
    pipeline_value: float
    currency: str
    total_enquiries: int
    total_lost: int


class FunnelStage(BaseModel):
    stage: str
    label: str
    count: int


class ChannelCount(BaseModel):
    channel: str
    count: int


class UpcomingBooking(BaseModel):
    proposal_id: str
    title: str
    venue_name: str
    event_date: str


class RevenueMonth(BaseModel):
    month: str  # "YYYY-MM"
    revenue: float


class LeaderboardRow(BaseModel):
    staff_name: str
    won_count: int
    revenue: float


class VenuePerformanceRow(BaseModel):
    venue_name: str
    booking_count: int
    revenue: float


class LostReasonCount(BaseModel):
    reason: str
    count: int


class AgingDeal(BaseModel):
    enquiry_id: str
    summary: str
    stage: str
    days_stuck: int
    assigned_to_name: str | None  # only resolved for admin; null for staff (always "mine")


class ProposalStatusCount(BaseModel):
    status: str
    count: int


class WorkloadRow(BaseModel):
    staff_name: str
    open_count: int
    awaiting_count: int


class DashboardSummary(BaseModel):
    role: str
    kpis: DashboardKpis
    funnel: list[FunnelStage]
    channel_breakdown: list[ChannelCount]
    upcoming_bookings: list[UpcomingBooking]
    lost_reasons: list[LostReasonCount]
    aging_deals: list[AgingDeal]
    proposal_funnel: list[ProposalStatusCount]
    # Admin-only sections — empty lists for staff (see router: the
    # underlying proposals query itself is skipped for non-admins, not
    # just hidden here, since proposals RLS doesn't yet scope by owner).
    revenue_trend: list[RevenueMonth]
    leaderboard: list[LeaderboardRow]
    venue_performance: list[VenuePerformanceRow]
    workload: list[WorkloadRow]
