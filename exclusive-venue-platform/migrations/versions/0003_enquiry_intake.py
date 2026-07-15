"""organisations, contacts, enquiries + RLS

Revision ID: 0003
Revises: 0002
Create Date: 2026-07-13

Task C1 (specs/0001-product-1-core/tasks.md). Schema per erd.md §5;
policies per rls-matrix.md. anon has no policy on any of these tables —
"INSERT via edge function only" means the eventual public intake path
(C2/C4) writes through the Supabase service role (which bypasses RLS
entirely), never through a client holding the anon key.
"""

from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # --- organisations ------------------------------------------------
    op.execute(
        """
        CREATE TABLE organisations (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            name TEXT NOT NULL,
            kind TEXT NOT NULL DEFAULT 'other'
                CHECK (kind IN ('corporate', 'agency', 'brand', 'production_house', 'other')),
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )
    op.execute(
        """
        CREATE TRIGGER organisations_set_updated_at
        BEFORE UPDATE ON organisations
        FOR EACH ROW
        EXECUTE FUNCTION set_updated_at()
        """
    )

    # --- contacts -------------------------------------------------------
    # Deliberately independent of profiles — most contacts never log in.
    # email is indexed for dedup, NOT unique: hard uniqueness would break
    # Concierge intake (the same person can enquire more than once).
    op.execute(
        """
        CREATE TABLE contacts (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            full_name TEXT NOT NULL,
            email TEXT,
            phone TEXT,
            organisation_id UUID REFERENCES organisations (id) ON DELETE SET NULL,
            source TEXT NOT NULL
                CHECK (source IN ('email', 'web_form', 'concierge', 'manual')),
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )
    op.execute("CREATE INDEX contacts_email_idx ON contacts (email)")
    op.execute("CREATE INDEX contacts_organisation_id_idx ON contacts (organisation_id)")
    op.execute(
        """
        CREATE TRIGGER contacts_set_updated_at
        BEFORE UPDATE ON contacts
        FOR EACH ROW
        EXECUTE FUNCTION set_updated_at()
        """
    )

    # --- enquiries --------------------------------------------------------
    # The pipeline spine (erd.md §5). follow_up/visit are status labels
    # only in this build — no scheduling/reminder logic attached.
    op.execute(
        """
        CREATE TABLE enquiries (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            contact_id UUID REFERENCES contacts (id) ON DELETE SET NULL,
            channel TEXT NOT NULL
                CHECK (channel IN ('email', 'web_form', 'manual', 'concierge')),
            raw_content TEXT NOT NULL,
            stage TEXT NOT NULL DEFAULT 'new'
                CHECK (stage IN (
                    'new', 'qualified', 'proposal_sent', 'follow_up',
                    'visit', 'negotiation', 'confirmed', 'lost'
                )),
            assigned_to UUID REFERENCES auth.users (id) ON DELETE SET NULL,
            created_by UUID REFERENCES auth.users (id) ON DELETE SET NULL,
            lost_reason TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )
    op.execute("CREATE INDEX enquiries_stage_idx ON enquiries (stage)")
    op.execute("CREATE INDEX enquiries_assigned_to_idx ON enquiries (assigned_to)")
    op.execute("CREATE INDEX enquiries_contact_id_idx ON enquiries (contact_id)")
    op.execute(
        """
        CREATE TRIGGER enquiries_set_updated_at
        BEFORE UPDATE ON enquiries
        FOR EACH ROW
        EXECUTE FUNCTION set_updated_at()
        """
    )

    # --- RLS: staff/admin ALL, no anon/landlord/supplier policy on any
    # of the three tables (rls-matrix.md) -------------------------------
    for table in ("organisations", "contacts", "enquiries"):
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(
            f"""
            CREATE POLICY {table}_staff_all ON {table}
            FOR ALL
            USING (has_role('staff') OR has_role('admin'))
            WITH CHECK (has_role('staff') OR has_role('admin'))
            """
        )


def downgrade() -> None:
    for table in ("enquiries", "contacts", "organisations"):
        op.execute(f"DROP POLICY IF EXISTS {table}_staff_all ON {table}")

    op.execute("DROP TABLE IF EXISTS enquiries")
    op.execute("DROP TABLE IF EXISTS contacts")
    op.execute("DROP TABLE IF EXISTS organisations")
