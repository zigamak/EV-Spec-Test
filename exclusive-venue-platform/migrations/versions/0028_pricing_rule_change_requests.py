"""pricing_rule_change_requests + RLS

Revision ID: 0028
Revises: 0027
Create Date: 2026-07-27

Task D1 (specs/0003-landlord-portal/tasks.md). Schema per erd.md §6a: the
landlord "propose, staff approves" pricing workflow, preserving the
constitution's trust boundary — a landlord never writes pricing_rules
directly (pricing_rules_landlord_select_own from 0005 stays read-only).
Approval (task D3, app-layer) creates a NEW versioned pricing_rules row,
never mutates an existing one, so F3 reproducibility (Product 1) stays
intact.

Critical RLS point, called out explicitly in tasks.md's D1/F2: the
landlord policy grants SELECT/INSERT only — there is deliberately no
landlord UPDATE policy at all, so a landlord cannot set status='approved'
themselves by any path, not just by convention. Only the staff_all policy
can change status.
"""

from alembic import op

revision = "0028"
down_revision = "0027"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE pricing_rule_change_requests (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            venue_id UUID NOT NULL REFERENCES venues (id) ON DELETE CASCADE,
            pricing_rules_id UUID REFERENCES pricing_rules (id),
            proposed_by UUID NOT NULL REFERENCES auth.users (id),
            payload JSONB NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'approved', 'rejected')),
            reviewed_by UUID REFERENCES auth.users (id),
            reviewed_at TIMESTAMPTZ,
            review_note TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )
    op.execute(
        "CREATE INDEX pricing_rule_change_requests_venue_id_idx "
        "ON pricing_rule_change_requests (venue_id)"
    )
    op.execute(
        """
        CREATE TRIGGER pricing_rule_change_requests_set_updated_at
        BEFORE UPDATE ON pricing_rule_change_requests
        FOR EACH ROW
        EXECUTE FUNCTION set_updated_at()
        """
    )

    # --- RLS (erd.md §7) ---------------------------------------------------
    op.execute("ALTER TABLE pricing_rule_change_requests ENABLE ROW LEVEL SECURITY")
    op.execute(
        """
        CREATE POLICY pricing_rule_change_requests_staff_all ON pricing_rule_change_requests
        FOR ALL
        USING (has_role('staff') OR has_role('admin'))
        WITH CHECK (has_role('staff') OR has_role('admin'))
        """
    )
    # SELECT own venue's requests.
    op.execute(
        """
        CREATE POLICY pricing_rule_change_requests_landlord_select_own
        ON pricing_rule_change_requests
        FOR SELECT
        USING (EXISTS (
            SELECT 1 FROM venues v
            WHERE v.id = pricing_rule_change_requests.venue_id AND v.landlord_id = auth.uid()
        ))
        """
    )
    # INSERT own venue's requests only, and only as the proposer, always
    # 'pending' — a landlord cannot insert a pre-approved row either.
    op.execute(
        """
        CREATE POLICY pricing_rule_change_requests_landlord_insert_own
        ON pricing_rule_change_requests
        FOR INSERT
        WITH CHECK (
            proposed_by = auth.uid()
            AND status = 'pending'
            AND EXISTS (
                SELECT 1 FROM venues v
                WHERE v.id = pricing_rule_change_requests.venue_id AND v.landlord_id = auth.uid()
            )
        )
        """
    )
    # Deliberately NO landlord UPDATE policy — see module docstring.


def downgrade() -> None:
    op.execute(
        "DROP POLICY IF EXISTS pricing_rule_change_requests_landlord_insert_own "
        "ON pricing_rule_change_requests"
    )
    op.execute(
        "DROP POLICY IF EXISTS pricing_rule_change_requests_landlord_select_own "
        "ON pricing_rule_change_requests"
    )
    op.execute(
        "DROP POLICY IF EXISTS pricing_rule_change_requests_staff_all ON pricing_rule_change_requests"
    )
    op.execute("DROP TABLE IF EXISTS pricing_rule_change_requests")
