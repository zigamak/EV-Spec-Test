"""venue_team_contacts — per-venue "dedicated team" roster

Revision ID: 0017
Revises: 0016
Create Date: 2026-07-18

Task B3 follow-up. Per-venue rather than a global staff directory: the
reference shows a specific point-of-contact team for that venue, which
may differ venue to venue (e.g. by landlord relationship). No anon SELECT
— phone/email are staff/landlord-own-venue only, never public.
"""

from alembic import op

revision = "0017"
down_revision = "0016"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE venue_team_contacts (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            venue_id UUID NOT NULL REFERENCES venues (id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            role TEXT NOT NULL,
            phone TEXT,
            email TEXT,
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )
    op.execute("CREATE INDEX venue_team_contacts_venue_id_idx ON venue_team_contacts (venue_id)")
    op.execute(
        """
        CREATE TRIGGER venue_team_contacts_set_updated_at
        BEFORE UPDATE ON venue_team_contacts
        FOR EACH ROW
        EXECUTE FUNCTION set_updated_at()
        """
    )

    op.execute("ALTER TABLE venue_team_contacts ENABLE ROW LEVEL SECURITY")
    op.execute(
        """
        CREATE POLICY venue_team_contacts_staff_all ON venue_team_contacts
        FOR ALL
        USING (has_role('staff') OR has_role('admin'))
        WITH CHECK (has_role('staff') OR has_role('admin'))
        """
    )
    op.execute(
        """
        CREATE POLICY venue_team_contacts_landlord_all_own ON venue_team_contacts
        FOR ALL
        USING (EXISTS (
            SELECT 1 FROM venues v
            WHERE v.id = venue_team_contacts.venue_id AND v.landlord_id = auth.uid()
        ))
        WITH CHECK (EXISTS (
            SELECT 1 FROM venues v
            WHERE v.id = venue_team_contacts.venue_id AND v.landlord_id = auth.uid()
        ))
        """
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS venue_team_contacts")
