"""proposal_analytics_events — client-side open/venue-view tracking

Revision ID: 0023
Revises: 0022
Create Date: 2026-07-25

Closes a real gap: ProposalStatus has carried an unused "viewed" value
since 0006 and nothing has ever set it, and there's been no way to tell
whether a sent proposal was ever opened, let alone which venue options a
client actually scrolled to. Written by the public, unauthenticated link
page (web/app/p/[token]) via the service-role client — same trust model
as routers/public_proposals.py's existing GET (token validated in code
first, anon has no RLS policy on this table at all, same rls-matrix.md
hard line already applied to proposals/proposal_venues).

Two event types only: 'open' (page load; venue_id null) and 'venue_seen'
(a specific venue card scrolled into view client-side, deduped per
session — see PublicProposalPage). Deliberately NOT trying to measure
per-venue "time spent" — the public page renders every option in one
scroll, so dwell time per option isn't a real signal without much
heavier instrumentation; scrolled-into-view is the honest granularity
available.

Read access follows the same per-owner pattern as enquiries (0022) —
staff see analytics only for proposals on their own enquiries, admin
sees everything.
"""

from alembic import op

revision = "0023"
down_revision = "0022"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE proposal_analytics_events (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            proposal_id UUID NOT NULL REFERENCES proposals (id) ON DELETE CASCADE,
            venue_id UUID REFERENCES venues (id) ON DELETE SET NULL,
            event_type TEXT NOT NULL CHECK (event_type IN ('open', 'venue_seen')),
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )
    op.execute(
        "CREATE INDEX proposal_analytics_events_proposal_idx ON proposal_analytics_events (proposal_id, created_at)"
    )

    op.execute("ALTER TABLE proposal_analytics_events ENABLE ROW LEVEL SECURITY")
    op.execute(
        """
        CREATE POLICY proposal_analytics_admin_all ON proposal_analytics_events
        FOR ALL
        USING (has_role('admin'))
        WITH CHECK (has_role('admin'))
        """
    )
    op.execute(
        """
        CREATE POLICY proposal_analytics_staff_select_own ON proposal_analytics_events
        FOR SELECT
        USING (
            has_role('staff')
            AND EXISTS (
                SELECT 1 FROM proposals p
                JOIN enquiries e ON e.id = p.enquiry_id
                WHERE p.id = proposal_analytics_events.proposal_id AND e.assigned_to = auth.uid()
            )
        )
        """
    )
    # No staff/anon write policy — every write goes through the
    # service-role client from the public link endpoint (token validated
    # in code), the same as public_proposals.py's read path.


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS proposal_analytics_events")
