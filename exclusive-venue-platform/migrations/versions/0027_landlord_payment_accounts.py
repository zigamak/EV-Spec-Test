"""landlord_payment_accounts + RLS

Revision ID: 0027
Revises: 0026
Create Date: 2026-07-27

Task C1 (specs/0003-landlord-portal/tasks.md). Schema per erd.md §6a:
manual payout only in this build — Stripe Connect explicitly deferred
(Thailand-based Connect accounts can't self-serve Express onboarding,
researched live during Product 3 planning). Landlord enters their own
bank details directly (self-service, not staff-entered, per direct
instruction); staff verifies manually and flips status; actual payout
execution stays a manual bank transfer outside the app.

Holds real bank data (unlike a Stripe-backed version, where Stripe would
hold it instead) — RLS locked to owning landlord + staff; masked display
(last 4 digits) is an application/UI concern (task C2/C3), not enforced
by the database.
"""

from alembic import op

revision = "0027"
down_revision = "0026"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE landlord_payment_accounts (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            landlord_id UUID NOT NULL UNIQUE REFERENCES auth.users (id),
            bank_name TEXT,
            account_holder_name TEXT,
            account_number TEXT,
            swift_bic TEXT,
            currency TEXT NOT NULL REFERENCES currencies (code),
            status TEXT NOT NULL DEFAULT 'pending_verification'
                CHECK (status IN ('pending_verification', 'verified')),
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )
    op.execute(
        """
        CREATE TRIGGER landlord_payment_accounts_set_updated_at
        BEFORE UPDATE ON landlord_payment_accounts
        FOR EACH ROW
        EXECUTE FUNCTION set_updated_at()
        """
    )

    # --- RLS: landlord SELECT/UPDATE own, staff ALL (erd.md §7) -----------
    op.execute("ALTER TABLE landlord_payment_accounts ENABLE ROW LEVEL SECURITY")
    op.execute(
        """
        CREATE POLICY landlord_payment_accounts_staff_all ON landlord_payment_accounts
        FOR ALL
        USING (has_role('staff') OR has_role('admin'))
        WITH CHECK (has_role('staff') OR has_role('admin'))
        """
    )
    op.execute(
        """
        CREATE POLICY landlord_payment_accounts_landlord_own ON landlord_payment_accounts
        FOR ALL
        USING (landlord_id = auth.uid())
        WITH CHECK (landlord_id = auth.uid())
        """
    )


def downgrade() -> None:
    op.execute(
        "DROP POLICY IF EXISTS landlord_payment_accounts_landlord_own ON landlord_payment_accounts"
    )
    op.execute(
        "DROP POLICY IF EXISTS landlord_payment_accounts_staff_all ON landlord_payment_accounts"
    )
    op.execute("DROP TABLE IF EXISTS landlord_payment_accounts")
