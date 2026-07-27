"""currencies + pricing_rules.currency FK

Revision ID: 0025
Revises: 0024
Create Date: 2026-07-27

Task A1 (specs/0003-landlord-portal/tasks.md). Shared foundation, not
landlord-specific — erd.md §6a: introduced now because Product 3's
landlord_payment_accounts and Product 4's vendor marketplace pricing both
need the same reference data, rather than each redefining currency
handling. Deliberately no exchange-rate columns — nothing in either
product converts between currencies yet, so live/scheduled FX-rate
fetching would be speculative infrastructure; add it later against a
real conversion requirement.

Seed list confirmed in-session: HKD (existing platform default) + THB +
USD (added ahead of an actual Bangkok/Thailand expansion decision, since
seeding extra reference rows now is free and avoids a follow-up seed-data
change later if that expansion becomes real).

pricing_rules.currency has been a free-text column with no CHECK
constraint since 0005 (just DEFAULT 'HKD') — this ALTERs it into an FK
against currencies.code. No backfill UPDATE is needed: every existing row
already holds 'HKD', which this migration seeds first, so the FK
constraint is satisfiable the moment it's added.
"""

from alembic import op

revision = "0025"
down_revision = "0024"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE currencies (
            code TEXT PRIMARY KEY,
            symbol TEXT NOT NULL,
            name TEXT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )
    op.execute(
        """
        CREATE TRIGGER currencies_set_updated_at
        BEFORE UPDATE ON currencies
        FOR EACH ROW
        EXECUTE FUNCTION set_updated_at()
        """
    )
    op.execute(
        """
        INSERT INTO currencies (code, symbol, name) VALUES
            ('HKD', 'HK$', 'Hong Kong Dollar'),
            ('THB', '฿', 'Thai Baht'),
            ('USD', '$', 'US Dollar')
        """
    )

    # --- RLS: public reference data, staff ALL (erd.md §7) ---------------
    op.execute("ALTER TABLE currencies ENABLE ROW LEVEL SECURITY")
    op.execute(
        """
        CREATE POLICY currencies_anon_select ON currencies
        FOR SELECT
        USING (true)
        """
    )
    op.execute(
        """
        CREATE POLICY currencies_staff_all ON currencies
        FOR ALL
        USING (has_role('staff') OR has_role('admin'))
        WITH CHECK (has_role('staff') OR has_role('admin'))
        """
    )

    # --- pricing_rules.currency: free-text default -> FK -----------------
    # Backfill is a no-op in practice (every row already holds the seeded
    # 'HKD'), but included defensively in case a row somehow holds a value
    # outside the seed list — same "backfill-then-constrain" order as
    # 0007/0008, so the FK is never added while a violating row exists.
    op.execute(
        "UPDATE pricing_rules SET currency = 'HKD' "
        "WHERE currency NOT IN (SELECT code FROM currencies)"
    )
    op.execute(
        """
        ALTER TABLE pricing_rules
        ADD CONSTRAINT pricing_rules_currency_fkey
        FOREIGN KEY (currency) REFERENCES currencies (code)
        """
    )


def downgrade() -> None:
    op.execute(
        "ALTER TABLE pricing_rules DROP CONSTRAINT IF EXISTS pricing_rules_currency_fkey"
    )
    op.execute("DROP POLICY IF EXISTS currencies_staff_all ON currencies")
    op.execute("DROP POLICY IF EXISTS currencies_anon_select ON currencies")
    op.execute("DROP TABLE IF EXISTS currencies")
