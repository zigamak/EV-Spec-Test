"""vendor_payment_accounts + RLS

Revision ID: 0037
Revises: 0036
Create Date: 2026-07-27

Task (plan.md §2, item 9). Schema per erd.md §6b: payout_method is a
per-vendor SETTING ('manual' or 'stripe_connect'), not a build-wide
choice — Stripe Connect Express isn't self-serve everywhere (Thailand
research from Product 3 planning), so a vendor where it doesn't work
falls back to manual, same bank-details-on-file pattern as
landlord_payment_accounts (erd.md §6a). Holds real bank data when manual
— same masked-display/RLS-locked treatment.
"""

from alembic import op

revision = "0037"
down_revision = "0036"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE vendor_payment_accounts (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            vendor_id UUID NOT NULL UNIQUE REFERENCES vendors (id),
            payout_method TEXT NOT NULL DEFAULT 'manual'
                CHECK (payout_method IN ('manual', 'stripe_connect')),
            stripe_connect_account_id TEXT,
            bank_name TEXT,
            account_holder_name TEXT,
            account_number TEXT,
            swift_bic TEXT,
            currency TEXT NOT NULL REFERENCES currencies (code),
            status TEXT NOT NULL DEFAULT 'not_started'
                CHECK (status IN ('not_started', 'pending_verification', 'verified', 'active', 'restricted')),
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )
    op.execute(
        """
        CREATE TRIGGER vendor_payment_accounts_set_updated_at
        BEFORE UPDATE ON vendor_payment_accounts
        FOR EACH ROW
        EXECUTE FUNCTION set_updated_at()
        """
    )

    # --- RLS: vendor SELECT/UPDATE own, staff ALL (erd.md §7) -----------
    op.execute("ALTER TABLE vendor_payment_accounts ENABLE ROW LEVEL SECURITY")
    op.execute(
        """
        CREATE POLICY vendor_payment_accounts_staff_all ON vendor_payment_accounts
        FOR ALL
        USING (has_role('staff') OR has_role('admin'))
        WITH CHECK (has_role('staff') OR has_role('admin'))
        """
    )
    op.execute(
        """
        CREATE POLICY vendor_payment_accounts_vendor_own ON vendor_payment_accounts
        FOR ALL
        USING (EXISTS (
            SELECT 1 FROM vendors v
            WHERE v.id = vendor_payment_accounts.vendor_id AND v.owner_user_id = auth.uid()
        ))
        WITH CHECK (EXISTS (
            SELECT 1 FROM vendors v
            WHERE v.id = vendor_payment_accounts.vendor_id AND v.owner_user_id = auth.uid()
        ))
        """
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS vendor_payment_accounts_vendor_own ON vendor_payment_accounts")
    op.execute("DROP POLICY IF EXISTS vendor_payment_accounts_staff_all ON vendor_payment_accounts")
    op.execute("DROP TABLE IF EXISTS vendor_payment_accounts")
