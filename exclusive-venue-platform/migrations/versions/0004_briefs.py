"""briefs + RLS

Revision ID: 0004
Revises: 0003
Create Date: 2026-07-13

Task D1 (specs/0001-product-1-core/tasks.md). Schema per erd.md §5. A
separate, versioned table (not columns on enquiries) because an enquiry
can be re-parsed and each proposal pins the exact brief version that
priced it (proposals.brief_id, G1). budget_basis is the one field a
parsing mistake would silently corrupt every downstream quote through,
hence a hard CHECK rather than trusting the parser.
"""

from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE briefs (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            enquiry_id UUID NOT NULL REFERENCES enquiries (id) ON DELETE CASCADE,
            version INTEGER NOT NULL,
            event_date DATE,
            event_date_flexible BOOLEAN NOT NULL DEFAULT false,
            guest_count INTEGER CHECK (guest_count IS NULL OR guest_count > 0),
            event_type TEXT,
            budget_amount NUMERIC(12, 2),
            budget_basis TEXT CHECK (budget_basis IN ('total', 'per_head')),
            duration_hours NUMERIC(4, 1),
            location_preference TEXT,
            requirements JSONB NOT NULL DEFAULT '{}'::jsonb,
            confidence NUMERIC(3, 2) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
            review_status TEXT NOT NULL DEFAULT 'needs_review'
                CHECK (review_status IN (
                    'auto_accepted', 'needs_review', 'human_approved', 'human_corrected'
                )),
            reviewed_by UUID REFERENCES auth.users (id) ON DELETE SET NULL,
            parser_model TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            UNIQUE (enquiry_id, version),
            -- budget_amount without a basis is meaningless to the pricing
            -- engine — the same silent-corruption risk the column comment
            -- in erd.md §5 calls out.
            CHECK (
                (budget_amount IS NULL AND budget_basis IS NULL)
                OR (budget_amount IS NOT NULL AND budget_basis IS NOT NULL)
            )
        )
        """
    )
    op.execute("CREATE INDEX briefs_enquiry_id_version_idx ON briefs (enquiry_id, version DESC)")
    op.execute(
        """
        CREATE TRIGGER briefs_set_updated_at
        BEFORE UPDATE ON briefs
        FOR EACH ROW
        EXECUTE FUNCTION set_updated_at()
        """
    )

    op.execute("ALTER TABLE briefs ENABLE ROW LEVEL SECURITY")
    op.execute(
        """
        CREATE POLICY briefs_staff_all ON briefs
        FOR ALL
        USING (has_role('staff') OR has_role('admin'))
        WITH CHECK (has_role('staff') OR has_role('admin'))
        """
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS briefs_staff_all ON briefs")
    op.execute("DROP TABLE IF EXISTS briefs")
