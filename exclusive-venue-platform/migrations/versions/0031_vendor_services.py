"""vendor_services + RLS

Revision ID: 0031
Revises: 0030
Create Date: 2026-07-27

Task (plan.md §2, item 3). Schema per erd.md §6b: the structured price
list a vendor lists by default, with pricing_type='quote' as the escape
hatch for services where a fixed price doesn't fit. Depends on
`currencies` (Product 3's migration 0025) — Product 4's migrations are
sequenced to land after Product 3's, per plan.md §7's open sequencing
item, now resolved by build order (0025 already merged before this file).
"""

from alembic import op

revision = "0031"
down_revision = "0030"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE vendor_services (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            vendor_id UUID NOT NULL REFERENCES vendors (id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            description TEXT,
            pricing_type TEXT NOT NULL CHECK (pricing_type IN ('flat', 'per_head', 'per_hour', 'quote')),
            amount NUMERIC(12, 2) CHECK (amount IS NULL OR amount >= 0),
            currency TEXT NOT NULL REFERENCES currencies (code),
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            CHECK (
                (pricing_type = 'quote' AND amount IS NULL)
                OR (pricing_type != 'quote' AND amount IS NOT NULL)
            )
        )
        """
    )
    op.execute("CREATE INDEX vendor_services_vendor_id_idx ON vendor_services (vendor_id)")
    op.execute(
        """
        CREATE TRIGGER vendor_services_set_updated_at
        BEFORE UPDATE ON vendor_services
        FOR EACH ROW
        EXECUTE FUNCTION set_updated_at()
        """
    )

    # --- RLS: anon SELECT via active+subscribed vendor; staff ALL; vendor
    # ALL own (rls-matrix.md) --------------------------------------------
    op.execute("ALTER TABLE vendor_services ENABLE ROW LEVEL SECURITY")
    op.execute(
        """
        CREATE POLICY vendor_services_anon_select ON vendor_services
        FOR SELECT
        USING (EXISTS (
            SELECT 1 FROM vendors v
            JOIN vendor_subscriptions vs ON vs.vendor_id = v.id
            WHERE v.id = vendor_services.vendor_id AND v.status = 'active' AND vs.status = 'active'
        ))
        """
    )
    op.execute(
        """
        CREATE POLICY vendor_services_staff_all ON vendor_services
        FOR ALL
        USING (has_role('staff') OR has_role('admin'))
        WITH CHECK (has_role('staff') OR has_role('admin'))
        """
    )
    op.execute(
        """
        CREATE POLICY vendor_services_vendor_all_own ON vendor_services
        FOR ALL
        USING (EXISTS (
            SELECT 1 FROM vendors v WHERE v.id = vendor_services.vendor_id AND v.owner_user_id = auth.uid()
        ))
        WITH CHECK (EXISTS (
            SELECT 1 FROM vendors v WHERE v.id = vendor_services.vendor_id AND v.owner_user_id = auth.uid()
        ))
        """
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS vendor_services_vendor_all_own ON vendor_services")
    op.execute("DROP POLICY IF EXISTS vendor_services_staff_all ON vendor_services")
    op.execute("DROP POLICY IF EXISTS vendor_services_anon_select ON vendor_services")
    op.execute("DROP TABLE IF EXISTS vendor_services")
