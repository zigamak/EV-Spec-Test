"""commission_rules + RLS

Revision ID: 0033
Revises: 0032
Create Date: 2026-07-27

Task (plan.md §2, item 5). Schema per erd.md §6b: platform-wide default
(vendor_id NULL) + optional per-vendor override, versioned by
effective_from/effective_to exactly like pricing_rules (§4) so a rate
change never retroactively alters an already-completed order's payout
math. Rate = percentage + fixed fee, per direct instruction (matches
Stripe's own combined-fee model).

**Placeholder default rate, flagged not confirmed:** plan.md §7 logged
the actual commission percentage as an open business decision, still
unanswered. Seeding *some* default row is required for any order to be
priceable at all (the lookup in orders.py falls back to this row when no
vendor-specific override exists) — 15% + 0 fixed fee is seeded as a
reasonable placeholder, not a confirmed business number. Staff can
correct it via the existing pricing_rule_change_requests-style UI
pattern (a future commission-rate edit screen) or directly once the real
figure is confirmed — this is data, not a schema constraint, so
correcting it needs no new migration.
"""

from alembic import op

revision = "0033"
down_revision = "0032"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE commission_rules (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            vendor_id UUID REFERENCES vendors (id),
            percentage_rate NUMERIC(5, 2) NOT NULL CHECK (percentage_rate >= 0 AND percentage_rate <= 100),
            fixed_fee NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (fixed_fee >= 0),
            currency TEXT NOT NULL REFERENCES currencies (code),
            effective_from DATE NOT NULL,
            effective_to DATE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            CHECK (effective_to IS NULL OR effective_to >= effective_from)
        )
        """
    )
    op.execute(
        "CREATE INDEX commission_rules_vendor_effective_idx "
        "ON commission_rules (vendor_id, effective_from DESC)"
    )
    # Exactly one platform-wide default active at a time: a partial unique
    # index on vendor_id IS NULL AND effective_to IS NULL.
    op.execute(
        """
        CREATE UNIQUE INDEX commission_rules_one_active_default_idx
        ON commission_rules ((vendor_id IS NULL))
        WHERE vendor_id IS NULL AND effective_to IS NULL
        """
    )
    op.execute(
        """
        CREATE TRIGGER commission_rules_set_updated_at
        BEFORE UPDATE ON commission_rules
        FOR EACH ROW
        EXECUTE FUNCTION set_updated_at()
        """
    )
    op.execute(
        """
        INSERT INTO commission_rules (vendor_id, percentage_rate, fixed_fee, currency, effective_from)
        VALUES (NULL, 15.00, 0, 'HKD', CURRENT_DATE)
        """
    )

    # --- RLS: staff ALL; vendor SELECT own override + the platform default
    op.execute("ALTER TABLE commission_rules ENABLE ROW LEVEL SECURITY")
    op.execute(
        """
        CREATE POLICY commission_rules_staff_all ON commission_rules
        FOR ALL
        USING (has_role('staff') OR has_role('admin'))
        WITH CHECK (has_role('staff') OR has_role('admin'))
        """
    )
    op.execute(
        """
        CREATE POLICY commission_rules_vendor_select_own_or_default ON commission_rules
        FOR SELECT
        USING (
            vendor_id IS NULL
            OR EXISTS (
                SELECT 1 FROM vendors v WHERE v.id = commission_rules.vendor_id AND v.owner_user_id = auth.uid()
            )
        )
        """
    )


def downgrade() -> None:
    op.execute(
        "DROP POLICY IF EXISTS commission_rules_vendor_select_own_or_default ON commission_rules"
    )
    op.execute("DROP POLICY IF EXISTS commission_rules_staff_all ON commission_rules")
    op.execute("DROP TABLE IF EXISTS commission_rules")
