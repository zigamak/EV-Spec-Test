"""landlord_invites + RLS

Revision ID: 0026
Revises: 0025
Create Date: 2026-07-27

Task B1 (specs/0003-landlord-portal/tasks.md). Schema per erd.md §6a: a
thin tracking layer over Supabase Auth's native `inviteUserByEmail`
(admin API, service-role only) — the actual account creation and email
delivery is Supabase Auth's job, this table just tracks who staff invited
and whether it converted, so a venue's landlord_id can be set once
acceptance completes (either staff assigns an existing landlord to a
venue, or the landlord adds their own venue post-acceptance — both paths
in prd.md §4 reuse this same row). Staff-only table — never exposed to
the invitee directly.
"""

from alembic import op

revision = "0026"
down_revision = "0025"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE landlord_invites (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            email TEXT NOT NULL,
            invited_by UUID NOT NULL REFERENCES auth.users (id),
            status TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'accepted', 'expired')),
            invited_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            accepted_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )
    op.execute("CREATE INDEX landlord_invites_email_idx ON landlord_invites (email)")
    op.execute(
        """
        CREATE TRIGGER landlord_invites_set_updated_at
        BEFORE UPDATE ON landlord_invites
        FOR EACH ROW
        EXECUTE FUNCTION set_updated_at()
        """
    )

    # --- RLS: staff ALL only — no landlord/anon policy at all (erd.md §7) -
    op.execute("ALTER TABLE landlord_invites ENABLE ROW LEVEL SECURITY")
    op.execute(
        """
        CREATE POLICY landlord_invites_staff_all ON landlord_invites
        FOR ALL
        USING (has_role('staff') OR has_role('admin'))
        WITH CHECK (has_role('staff') OR has_role('admin'))
        """
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS landlord_invites_staff_all ON landlord_invites")
    op.execute("DROP TABLE IF EXISTS landlord_invites")
