"""payment_methods + RLS

Revision ID: 0032
Revises: 0031
Create Date: 2026-07-27

Task (plan.md §2, item 4). Reference table per erd.md §6b — extensible,
Stripe-only today, mirrors the currencies "reference table now, extend
later against real need" pattern (Product 3). payments.payment_method
references this instead of a hardcoded string.
"""

from alembic import op

revision = "0032"
down_revision = "0031"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE payment_methods (
            code TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            enabled BOOLEAN NOT NULL DEFAULT true,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )
    op.execute(
        """
        CREATE TRIGGER payment_methods_set_updated_at
        BEFORE UPDATE ON payment_methods
        FOR EACH ROW
        EXECUTE FUNCTION set_updated_at()
        """
    )
    op.execute("INSERT INTO payment_methods (code, name) VALUES ('stripe', 'Stripe')")

    op.execute("ALTER TABLE payment_methods ENABLE ROW LEVEL SECURITY")
    op.execute(
        """
        CREATE POLICY payment_methods_anon_select ON payment_methods
        FOR SELECT
        USING (true)
        """
    )
    op.execute(
        """
        CREATE POLICY payment_methods_staff_all ON payment_methods
        FOR ALL
        USING (has_role('staff') OR has_role('admin'))
        WITH CHECK (has_role('staff') OR has_role('admin'))
        """
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS payment_methods_staff_all ON payment_methods")
    op.execute("DROP POLICY IF EXISTS payment_methods_anon_select ON payment_methods")
    op.execute("DROP TABLE IF EXISTS payment_methods")
