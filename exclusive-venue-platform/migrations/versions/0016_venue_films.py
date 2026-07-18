"""venue_films — video reels with a production pipeline status

Revision ID: 0016
Revises: 0015
Create Date: 2026-07-18

Task B3 follow-up. Distinct from venue_media: a film can be planned or
in production before any file exists ("FILM COMING SOON" on the
reference), so — unlike venue_media, where storage_path is required —
video_media_id here is nullable and only set once a finished cut is
uploaded. duration_label is free text ("0:24") rather than an interval:
it's editorial copy, not something anything computes against.
"""

from alembic import op

revision = "0016"
down_revision = "0015"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE venue_films (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            venue_id UUID NOT NULL REFERENCES venues (id) ON DELETE CASCADE,
            title TEXT NOT NULL,
            duration_label TEXT,
            status TEXT NOT NULL DEFAULT 'planned'
                CHECK (status IN ('planned', 'in_production', 'delivered')),
            video_media_id UUID REFERENCES venue_media (id) ON DELETE SET NULL,
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )
    op.execute("CREATE INDEX venue_films_venue_id_idx ON venue_films (venue_id)")
    op.execute(
        """
        CREATE TRIGGER venue_films_set_updated_at
        BEFORE UPDATE ON venue_films
        FOR EACH ROW
        EXECUTE FUNCTION set_updated_at()
        """
    )

    op.execute("ALTER TABLE venue_films ENABLE ROW LEVEL SECURITY")
    op.execute(
        """
        CREATE POLICY venue_films_anon_select_active_venue ON venue_films
        FOR SELECT
        USING (EXISTS (
            SELECT 1 FROM venues v
            WHERE v.id = venue_films.venue_id AND v.status = 'active'
        ))
        """
    )
    op.execute(
        """
        CREATE POLICY venue_films_staff_all ON venue_films
        FOR ALL
        USING (has_role('staff') OR has_role('admin'))
        WITH CHECK (has_role('staff') OR has_role('admin'))
        """
    )
    op.execute(
        """
        CREATE POLICY venue_films_landlord_all_own ON venue_films
        FOR ALL
        USING (EXISTS (
            SELECT 1 FROM venues v
            WHERE v.id = venue_films.venue_id AND v.landlord_id = auth.uid()
        ))
        WITH CHECK (EXISTS (
            SELECT 1 FROM venues v
            WHERE v.id = venue_films.venue_id AND v.landlord_id = auth.uid()
        ))
        """
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS venue_films")
