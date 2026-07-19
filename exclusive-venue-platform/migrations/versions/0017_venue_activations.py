"""venue_activations — past events/activations log for the Venue Profile page

Revision ID: 0015
Revises: 0014
Create Date: 2026-07-18

Task B3 follow-up. The "Past events" section on the reference profile
(client name, event type, date) is real client history, not a stat we can
derive from anything already in the schema (enquiries/proposals track the
sales pipeline, not a durable "this brand held this event here" record).
No anon SELECT policy — client names under NDA are staff/landlord-own-venue
only, never exposed to any public/Concierge-facing read path.
"""

from alembic import op

revision = "0017"
down_revision = "0016"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE venue_activations (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            venue_id UUID NOT NULL REFERENCES venues (id) ON DELETE CASCADE,
            client_name TEXT NOT NULL,
            client_category TEXT,
            event_type TEXT,
            event_date DATE,
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )
    op.execute("CREATE INDEX venue_activations_venue_id_idx ON venue_activations (venue_id)")
    op.execute(
        """
        CREATE TRIGGER venue_activations_set_updated_at
        BEFORE UPDATE ON venue_activations
        FOR EACH ROW
        EXECUTE FUNCTION set_updated_at()
        """
    )

    op.execute("ALTER TABLE venue_activations ENABLE ROW LEVEL SECURITY")
    op.execute(
        """
        CREATE POLICY venue_activations_staff_all ON venue_activations
        FOR ALL
        USING (has_role('staff') OR has_role('admin'))
        WITH CHECK (has_role('staff') OR has_role('admin'))
        """
    )
    op.execute(
        """
        CREATE POLICY venue_activations_landlord_all_own ON venue_activations
        FOR ALL
        USING (EXISTS (
            SELECT 1 FROM venues v
            WHERE v.id = venue_activations.venue_id AND v.landlord_id = auth.uid()
        ))
        WITH CHECK (EXISTS (
            SELECT 1 FROM venues v
            WHERE v.id = venue_activations.venue_id AND v.landlord_id = auth.uid()
        ))
        """
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS venue_activations")
