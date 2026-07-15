"""venues, venue_configurations, venue_media, venue_availability, venue_restrictions + RLS

Revision ID: 0002
Revises: 0001
Create Date: 2026-07-12

Task B1 (specs/0001-product-1-core/tasks.md). Schema per erd.md §4;
policies per rls-matrix.md. venues.hero_media_id references venue_media,
which itself references venues — the FK is added after both tables exist
to break the cycle.
"""

from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # --- venues -------------------------------------------------------
    op.execute(
        """
        CREATE TABLE venues (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            name TEXT NOT NULL,
            slug TEXT NOT NULL UNIQUE,
            description TEXT,
            address TEXT,
            district TEXT,
            landlord_id UUID REFERENCES auth.users (id) ON DELETE SET NULL,
            status TEXT NOT NULL DEFAULT 'draft'
                CHECK (status IN ('draft', 'pending_approval', 'active', 'inactive')),
            approved_by UUID REFERENCES auth.users (id) ON DELETE SET NULL,
            approved_at TIMESTAMPTZ,
            hero_media_id UUID,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )
    op.execute("CREATE INDEX venues_status_idx ON venues (status) WHERE status = 'active'")
    op.execute("CREATE INDEX venues_landlord_id_idx ON venues (landlord_id)")
    op.execute(
        """
        CREATE TRIGGER venues_set_updated_at
        BEFORE UPDATE ON venues
        FOR EACH ROW
        EXECUTE FUNCTION set_updated_at()
        """
    )

    # --- venue_configurations -------------------------------------------
    op.execute(
        """
        CREATE TABLE venue_configurations (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            venue_id UUID NOT NULL REFERENCES venues (id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            capacity INTEGER NOT NULL CHECK (capacity > 0),
            notes TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )
    op.execute("CREATE INDEX venue_configurations_venue_id_idx ON venue_configurations (venue_id)")
    op.execute(
        """
        CREATE TRIGGER venue_configurations_set_updated_at
        BEFORE UPDATE ON venue_configurations
        FOR EACH ROW
        EXECUTE FUNCTION set_updated_at()
        """
    )

    # --- venue_media ----------------------------------------------------
    op.execute(
        """
        CREATE TABLE venue_media (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            venue_id UUID NOT NULL REFERENCES venues (id) ON DELETE CASCADE,
            storage_path TEXT NOT NULL,
            kind TEXT NOT NULL CHECK (kind IN ('photo', 'video', 'floor_plan')),
            sort_order INTEGER NOT NULL DEFAULT 0,
            caption TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )
    op.execute("CREATE INDEX venue_media_venue_id_idx ON venue_media (venue_id)")
    op.execute(
        """
        CREATE TRIGGER venue_media_set_updated_at
        BEFORE UPDATE ON venue_media
        FOR EACH ROW
        EXECUTE FUNCTION set_updated_at()
        """
    )

    # Break the venues <-> venue_media cycle now that both tables exist.
    op.execute(
        """
        ALTER TABLE venues
        ADD CONSTRAINT venues_hero_media_id_fkey
        FOREIGN KEY (hero_media_id) REFERENCES venue_media (id) ON DELETE SET NULL
        """
    )

    # --- venue_availability -----------------------------------------------
    # Stored as blocked/booked windows, not open slots — absence of a row =
    # available (erd.md §4). A hold must carry an expiry; other reasons must not.
    op.execute(
        """
        CREATE TABLE venue_availability (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            venue_id UUID NOT NULL REFERENCES venues (id) ON DELETE CASCADE,
            starts_on DATE NOT NULL,
            ends_on DATE NOT NULL,
            reason TEXT NOT NULL
                CHECK (reason IN ('booked', 'hold', 'maintenance', 'landlord_blocked', 'other')),
            hold_expires_at TIMESTAMPTZ,
            note TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            CHECK (ends_on >= starts_on),
            CHECK (
                (reason = 'hold' AND hold_expires_at IS NOT NULL)
                OR (reason != 'hold' AND hold_expires_at IS NULL)
            )
        )
        """
    )
    op.execute(
        "CREATE INDEX venue_availability_venue_dates_idx "
        "ON venue_availability (venue_id, starts_on, ends_on)"
    )
    op.execute(
        """
        CREATE TRIGGER venue_availability_set_updated_at
        BEFORE UPDATE ON venue_availability
        FOR EACH ROW
        EXECUTE FUNCTION set_updated_at()
        """
    )

    # --- venue_restrictions -----------------------------------------------
    op.execute(
        """
        CREATE TABLE venue_restrictions (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            venue_id UUID NOT NULL REFERENCES venues (id) ON DELETE CASCADE,
            kind TEXT NOT NULL CHECK (kind IN (
                'no_amplified_music', 'no_smoking', 'no_open_flame',
                'min_age', 'curfew', 'no_red_wine', 'other'
            )),
            value TEXT,
            hard BOOLEAN NOT NULL DEFAULT true,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )
    op.execute("CREATE INDEX venue_restrictions_venue_id_idx ON venue_restrictions (venue_id)")
    op.execute(
        """
        CREATE TRIGGER venue_restrictions_set_updated_at
        BEFORE UPDATE ON venue_restrictions
        FOR EACH ROW
        EXECUTE FUNCTION set_updated_at()
        """
    )

    # --- RLS: venues ------------------------------------------------------
    # rls-matrix.md: anon SELECT where active; staff ALL; landlord SELECT/
    # UPDATE own, INSERT as pending_approval only, cannot self-activate.
    op.execute("ALTER TABLE venues ENABLE ROW LEVEL SECURITY")
    op.execute(
        """
        CREATE POLICY venues_anon_select_active ON venues
        FOR SELECT
        USING (status = 'active')
        """
    )
    op.execute(
        """
        CREATE POLICY venues_staff_all ON venues
        FOR ALL
        USING (has_role('staff') OR has_role('admin'))
        WITH CHECK (has_role('staff') OR has_role('admin'))
        """
    )
    op.execute(
        """
        CREATE POLICY venues_landlord_select_own ON venues
        FOR SELECT
        USING (landlord_id = auth.uid())
        """
    )
    op.execute(
        """
        CREATE POLICY venues_landlord_insert_own ON venues
        FOR INSERT
        WITH CHECK (landlord_id = auth.uid() AND status = 'pending_approval')
        """
    )
    op.execute(
        """
        CREATE POLICY venues_landlord_update_own ON venues
        FOR UPDATE
        USING (landlord_id = auth.uid())
        WITH CHECK (landlord_id = auth.uid() AND status IN ('draft', 'pending_approval'))
        """
    )

    # --- RLS: venue_configurations / venue_media / venue_availability /
    # venue_restrictions — identical shape (anon via active venue; staff
    # ALL; landlord ALL on own venue's rows), so generate the four
    # policies per table from one template.
    for table in (
        "venue_configurations",
        "venue_media",
        "venue_availability",
        "venue_restrictions",
    ):
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(
            f"""
            CREATE POLICY {table}_anon_select_active_venue ON {table}
            FOR SELECT
            USING (EXISTS (
                SELECT 1 FROM venues v
                WHERE v.id = {table}.venue_id AND v.status = 'active'
            ))
            """
        )
        op.execute(
            f"""
            CREATE POLICY {table}_staff_all ON {table}
            FOR ALL
            USING (has_role('staff') OR has_role('admin'))
            WITH CHECK (has_role('staff') OR has_role('admin'))
            """
        )
        op.execute(
            f"""
            CREATE POLICY {table}_landlord_all_own ON {table}
            FOR ALL
            USING (EXISTS (
                SELECT 1 FROM venues v
                WHERE v.id = {table}.venue_id AND v.landlord_id = auth.uid()
            ))
            WITH CHECK (EXISTS (
                SELECT 1 FROM venues v
                WHERE v.id = {table}.venue_id AND v.landlord_id = auth.uid()
            ))
            """
        )


def downgrade() -> None:
    for table in (
        "venue_restrictions",
        "venue_availability",
        "venue_media",
        "venue_configurations",
    ):
        op.execute(f"DROP POLICY IF EXISTS {table}_landlord_all_own ON {table}")
        op.execute(f"DROP POLICY IF EXISTS {table}_staff_all ON {table}")
        op.execute(f"DROP POLICY IF EXISTS {table}_anon_select_active_venue ON {table}")

    op.execute("DROP POLICY IF EXISTS venues_landlord_update_own ON venues")
    op.execute("DROP POLICY IF EXISTS venues_landlord_insert_own ON venues")
    op.execute("DROP POLICY IF EXISTS venues_landlord_select_own ON venues")
    op.execute("DROP POLICY IF EXISTS venues_staff_all ON venues")
    op.execute("DROP POLICY IF EXISTS venues_anon_select_active ON venues")

    op.execute("DROP TABLE IF EXISTS venue_restrictions")
    op.execute("DROP TABLE IF EXISTS venue_availability")
    op.execute("ALTER TABLE venues DROP CONSTRAINT IF EXISTS venues_hero_media_id_fkey")
    op.execute("DROP TABLE IF EXISTS venue_media")
    op.execute("DROP TABLE IF EXISTS venue_configurations")
    op.execute("DROP TABLE IF EXISTS venues")
