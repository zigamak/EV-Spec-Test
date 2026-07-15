"""pricing_rules, pricing_rule_addons + RLS

Revision ID: 0005
Revises: 0004
Create Date: 2026-07-13

Task F1 (specs/0001-product-1-core/tasks.md) — deterministic pricing
engine only, zero AI in this call path (constitution #1). Schema per
erd.md §4: versioned by effective_from/effective_to so a quote computed
today stays reproducible after rules change later (F3, proposal_venues'
pricing_rules_id pin in G1). jsonb tiers/multipliers/adjustments are
consumed atomically as one pure-function input by F2 — they never exist
independently of their parent ruleset row.
"""

from alembic import op

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE pricing_rules (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            venue_id UUID NOT NULL REFERENCES venues (id) ON DELETE CASCADE,
            currency TEXT NOT NULL DEFAULT 'HKD',
            base_rate NUMERIC(12, 2) NOT NULL CHECK (base_rate >= 0),
            per_head_tiers JSONB NOT NULL DEFAULT '[]'::jsonb,
            duration_multipliers JSONB NOT NULL DEFAULT '{}'::jsonb,
            day_adjustments JSONB NOT NULL DEFAULT '{}'::jsonb,
            season_adjustments JSONB NOT NULL DEFAULT '[]'::jsonb,
            min_spend NUMERIC(12, 2) CHECK (min_spend IS NULL OR min_spend >= 0),
            notes TEXT,
            effective_from DATE NOT NULL,
            effective_to DATE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            CHECK (effective_to IS NULL OR effective_to >= effective_from)
        )
        """
    )
    op.execute(
        "CREATE INDEX pricing_rules_venue_effective_idx "
        "ON pricing_rules (venue_id, effective_from DESC)"
    )
    op.execute(
        """
        CREATE TRIGGER pricing_rules_set_updated_at
        BEFORE UPDATE ON pricing_rules
        FOR EACH ROW
        EXECUTE FUNCTION set_updated_at()
        """
    )

    op.execute(
        """
        CREATE TABLE pricing_rule_addons (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            pricing_rules_id UUID NOT NULL REFERENCES pricing_rules (id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            pricing_type TEXT NOT NULL CHECK (pricing_type IN ('flat', 'per_head', 'per_hour')),
            amount NUMERIC(12, 2) NOT NULL CHECK (amount >= 0),
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )
    op.execute(
        "CREATE INDEX pricing_rule_addons_pricing_rules_id_idx "
        "ON pricing_rule_addons (pricing_rules_id)"
    )
    op.execute(
        """
        CREATE TRIGGER pricing_rule_addons_set_updated_at
        BEFORE UPDATE ON pricing_rule_addons
        FOR EACH ROW
        EXECUTE FUNCTION set_updated_at()
        """
    )

    # --- RLS ------------------------------------------------------------
    # rls-matrix.md hard line: anon gets NO policy at all here — quotes
    # are only ever surfaced via the pricing engine's own output (F2),
    # never a direct SELECT on the rules themselves (EV's commercial IP).
    op.execute("ALTER TABLE pricing_rules ENABLE ROW LEVEL SECURITY")
    op.execute(
        """
        CREATE POLICY pricing_rules_staff_all ON pricing_rules
        FOR ALL
        USING (has_role('staff') OR has_role('admin'))
        WITH CHECK (has_role('staff') OR has_role('admin'))
        """
    )
    op.execute(
        """
        CREATE POLICY pricing_rules_landlord_select_own ON pricing_rules
        FOR SELECT
        USING (EXISTS (
            SELECT 1 FROM venues v
            WHERE v.id = pricing_rules.venue_id AND v.landlord_id = auth.uid()
        ))
        """
    )

    op.execute("ALTER TABLE pricing_rule_addons ENABLE ROW LEVEL SECURITY")
    op.execute(
        """
        CREATE POLICY pricing_rule_addons_staff_all ON pricing_rule_addons
        FOR ALL
        USING (has_role('staff') OR has_role('admin'))
        WITH CHECK (has_role('staff') OR has_role('admin'))
        """
    )
    op.execute(
        """
        CREATE POLICY pricing_rule_addons_landlord_select_own ON pricing_rule_addons
        FOR SELECT
        USING (EXISTS (
            SELECT 1 FROM pricing_rules pr
            JOIN venues v ON v.id = pr.venue_id
            WHERE pr.id = pricing_rule_addons.pricing_rules_id AND v.landlord_id = auth.uid()
        ))
        """
    )


def downgrade() -> None:
    op.execute(
        "DROP POLICY IF EXISTS pricing_rule_addons_landlord_select_own ON pricing_rule_addons"
    )
    op.execute("DROP POLICY IF EXISTS pricing_rule_addons_staff_all ON pricing_rule_addons")
    op.execute("DROP POLICY IF EXISTS pricing_rules_landlord_select_own ON pricing_rules")
    op.execute("DROP POLICY IF EXISTS pricing_rules_staff_all ON pricing_rules")

    op.execute("DROP TABLE IF EXISTS pricing_rule_addons")
    op.execute("DROP TABLE IF EXISTS pricing_rules")
