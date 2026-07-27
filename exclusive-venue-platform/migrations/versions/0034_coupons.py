"""coupons + RLS

Revision ID: 0034
Revises: 0033
Create Date: 2026-07-27

Task (plan.md §2, item 6). Schema per erd.md §6b: same "platform default
vs vendor override" ownership shape as commission_rules — vendor_id
nullable, null = a platform-wide code staff creates, set = a vendor's own
promo code for their listings only. Never directly anon-SELECT-able
(rls-matrix.md hard line #1, extended from pricing_rules to coupons in
this product) — validated/applied via an RPC at checkout, not exposed as
a browsable list.
"""

from alembic import op

revision = "0034"
down_revision = "0033"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE coupons (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            code TEXT NOT NULL UNIQUE,
            vendor_id UUID REFERENCES vendors (id),
            discount_type TEXT NOT NULL CHECK (discount_type IN ('percentage', 'flat')),
            discount_value NUMERIC(12, 2) NOT NULL CHECK (discount_value >= 0),
            currency TEXT REFERENCES currencies (code),
            min_order_amount NUMERIC(12, 2) CHECK (min_order_amount IS NULL OR min_order_amount >= 0),
            max_uses INTEGER CHECK (max_uses IS NULL OR max_uses > 0),
            uses_count INTEGER NOT NULL DEFAULT 0,
            valid_from TIMESTAMPTZ NOT NULL DEFAULT now(),
            valid_to TIMESTAMPTZ,
            status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'disabled')),
            created_by UUID NOT NULL REFERENCES auth.users (id),
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            CHECK (
                (discount_type = 'flat' AND currency IS NOT NULL)
                OR (discount_type = 'percentage' AND currency IS NULL)
            ),
            CHECK (discount_type != 'percentage' OR discount_value <= 100)
        )
        """
    )
    op.execute("CREATE INDEX coupons_vendor_id_idx ON coupons (vendor_id)")
    op.execute(
        """
        CREATE TRIGGER coupons_set_updated_at
        BEFORE UPDATE ON coupons
        FOR EACH ROW
        EXECUTE FUNCTION set_updated_at()
        """
    )

    # --- RLS: NO anon SELECT at all; staff ALL; vendor SELECT/INSERT own
    op.execute("ALTER TABLE coupons ENABLE ROW LEVEL SECURITY")
    op.execute(
        """
        CREATE POLICY coupons_staff_all ON coupons
        FOR ALL
        USING (has_role('staff') OR has_role('admin'))
        WITH CHECK (has_role('staff') OR has_role('admin'))
        """
    )
    op.execute(
        """
        CREATE POLICY coupons_vendor_select_own ON coupons
        FOR SELECT
        USING (EXISTS (
            SELECT 1 FROM vendors v WHERE v.id = coupons.vendor_id AND v.owner_user_id = auth.uid()
        ))
        """
    )
    op.execute(
        """
        CREATE POLICY coupons_vendor_insert_own ON coupons
        FOR INSERT
        WITH CHECK (
            vendor_id IS NOT NULL
            AND created_by = auth.uid()
            AND EXISTS (
                SELECT 1 FROM vendors v WHERE v.id = coupons.vendor_id AND v.owner_user_id = auth.uid()
            )
        )
        """
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS coupons_vendor_insert_own ON coupons")
    op.execute("DROP POLICY IF EXISTS coupons_vendor_select_own ON coupons")
    op.execute("DROP POLICY IF EXISTS coupons_staff_all ON coupons")
    op.execute("DROP TABLE IF EXISTS coupons")
