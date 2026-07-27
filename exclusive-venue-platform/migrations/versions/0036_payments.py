"""payments + RLS

Revision ID: 0036
Revises: 0035
Create Date: 2026-07-27

Task (plan.md §2, item 8). Schema per erd.md §6b: the actual client-side
money movement for an order, fully decoupled/optional — an order can sit
at status='pending' indefinitely with zero linked payments rows.
No direct anon access — webhook/service-role-maintained, same trust
model vendor_subscriptions already uses for its own Stripe state.
"""

from alembic import op

revision = "0036"
down_revision = "0035"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE payments (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            order_id UUID NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
            payment_method TEXT NOT NULL REFERENCES payment_methods (code),
            stripe_payment_intent_id TEXT,
            amount NUMERIC(12, 2) NOT NULL CHECK (amount >= 0),
            currency TEXT NOT NULL REFERENCES currencies (code),
            status TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'succeeded', 'failed', 'refunded')),
            paid_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )
    op.execute("CREATE INDEX payments_order_id_idx ON payments (order_id)")
    op.execute(
        """
        CREATE TRIGGER payments_set_updated_at
        BEFORE UPDATE ON payments
        FOR EACH ROW
        EXECUTE FUNCTION set_updated_at()
        """
    )

    # --- RLS: no anon access; staff ALL; vendor SELECT own via order join
    op.execute("ALTER TABLE payments ENABLE ROW LEVEL SECURITY")
    op.execute(
        """
        CREATE POLICY payments_staff_all ON payments
        FOR ALL
        USING (has_role('staff') OR has_role('admin'))
        WITH CHECK (has_role('staff') OR has_role('admin'))
        """
    )
    op.execute(
        """
        CREATE POLICY payments_vendor_select_own ON payments
        FOR SELECT
        USING (EXISTS (
            SELECT 1 FROM orders o
            JOIN vendors v ON v.id = o.vendor_id
            WHERE o.id = payments.order_id AND v.owner_user_id = auth.uid()
        ))
        """
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS payments_vendor_select_own ON payments")
    op.execute("DROP POLICY IF EXISTS payments_staff_all ON payments")
    op.execute("DROP TABLE IF EXISTS payments")
