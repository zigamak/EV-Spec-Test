"""payouts + RLS

Revision ID: 0038
Revises: 0037
Create Date: 2026-07-27

Task (plan.md §2, item 10). Schema per erd.md §6b: the record of a
vendor actually getting paid for a completed order. `method` is copied
from the account's method at payout time (not a live join) since a
vendor could change payout_method between orders.
"""

from alembic import op

revision = "0038"
down_revision = "0037"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE payouts (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            vendor_id UUID NOT NULL REFERENCES vendors (id),
            order_id UUID NOT NULL REFERENCES orders (id),
            gross_amount NUMERIC(12, 2) NOT NULL CHECK (gross_amount >= 0),
            commission_amount NUMERIC(12, 2) NOT NULL CHECK (commission_amount >= 0),
            net_amount NUMERIC(12, 2) NOT NULL CHECK (net_amount >= 0),
            currency TEXT NOT NULL REFERENCES currencies (code),
            method TEXT NOT NULL CHECK (method IN ('manual', 'stripe_connect')),
            status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'failed')),
            paid_at TIMESTAMPTZ,
            paid_by UUID REFERENCES auth.users (id),
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )
    op.execute("CREATE INDEX payouts_vendor_id_idx ON payouts (vendor_id)")
    op.execute("CREATE INDEX payouts_order_id_idx ON payouts (order_id)")
    op.execute(
        """
        CREATE TRIGGER payouts_set_updated_at
        BEFORE UPDATE ON payouts
        FOR EACH ROW
        EXECUTE FUNCTION set_updated_at()
        """
    )

    # --- RLS: staff ALL; vendor SELECT own -------------------------------
    op.execute("ALTER TABLE payouts ENABLE ROW LEVEL SECURITY")
    op.execute(
        """
        CREATE POLICY payouts_staff_all ON payouts
        FOR ALL
        USING (has_role('staff') OR has_role('admin'))
        WITH CHECK (has_role('staff') OR has_role('admin'))
        """
    )
    op.execute(
        """
        CREATE POLICY payouts_vendor_select_own ON payouts
        FOR SELECT
        USING (EXISTS (
            SELECT 1 FROM vendors v WHERE v.id = payouts.vendor_id AND v.owner_user_id = auth.uid()
        ))
        """
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS payouts_vendor_select_own ON payouts")
    op.execute("DROP POLICY IF EXISTS payouts_staff_all ON payouts")
    op.execute("DROP TABLE IF EXISTS payouts")
