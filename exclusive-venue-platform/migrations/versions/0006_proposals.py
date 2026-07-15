"""proposals, proposal_venues, proposal_link_tokens + RLS

Revision ID: 0006
Revises: 0005
Create Date: 2026-07-13

Task G1 (specs/0001-product-1-core/tasks.md). Schema per erd.md §5.
proposal_venues.venue_id/configuration_id/pricing_rules_id are RESTRICT,
not CASCADE — a venue that has ever been quoted cannot be hard-deleted
(erd.md §5's "deliberate FK behavior, verified by testing"); retiring a
venue means setting its status to 'inactive' instead. proposals.brief_id
pins the exact brief version that priced it, independent of any later
re-parse of the same enquiry.
"""

from alembic import op

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE proposals (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            enquiry_id UUID NOT NULL REFERENCES enquiries (id) ON DELETE CASCADE,
            brief_id UUID NOT NULL REFERENCES briefs (id) ON DELETE RESTRICT,
            status TEXT NOT NULL DEFAULT 'draft'
                CHECK (status IN ('draft', 'pending_approval', 'sent', 'viewed', 'accepted', 'declined')),
            title TEXT NOT NULL,
            intro_copy TEXT,
            legal_boilerplate TEXT,
            currency TEXT NOT NULL DEFAULT 'HKD',
            origin TEXT NOT NULL CHECK (origin IN ('staff', 'concierge')),
            created_by UUID REFERENCES auth.users (id) ON DELETE SET NULL,
            sent_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )
    op.execute("CREATE INDEX proposals_enquiry_id_idx ON proposals (enquiry_id)")
    op.execute(
        """
        CREATE TRIGGER proposals_set_updated_at
        BEFORE UPDATE ON proposals
        FOR EACH ROW
        EXECUTE FUNCTION set_updated_at()
        """
    )

    op.execute(
        """
        CREATE TABLE proposal_venues (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            proposal_id UUID NOT NULL REFERENCES proposals (id) ON DELETE CASCADE,
            venue_id UUID NOT NULL REFERENCES venues (id) ON DELETE RESTRICT,
            configuration_id UUID NOT NULL REFERENCES venue_configurations (id) ON DELETE RESTRICT,
            pricing_rules_id UUID NOT NULL REFERENCES pricing_rules (id) ON DELETE RESTRICT,
            quote_breakdown JSONB NOT NULL,
            quote_total NUMERIC(12, 2) NOT NULL CHECK (quote_total >= 0),
            venue_copy TEXT,
            sort_order INTEGER NOT NULL DEFAULT 0,
            recommended BOOLEAN NOT NULL DEFAULT false,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )
    op.execute("CREATE INDEX proposal_venues_proposal_sort_idx ON proposal_venues (proposal_id, sort_order)")
    op.execute(
        """
        CREATE TRIGGER proposal_venues_set_updated_at
        BEFORE UPDATE ON proposal_venues
        FOR EACH ROW
        EXECUTE FUNCTION set_updated_at()
        """
    )

    op.execute(
        """
        CREATE TABLE proposal_link_tokens (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            proposal_id UUID NOT NULL REFERENCES proposals (id) ON DELETE CASCADE,
            token TEXT NOT NULL UNIQUE,
            expires_at TIMESTAMPTZ NOT NULL,
            revoked BOOLEAN NOT NULL DEFAULT false,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )
    op.execute(
        "CREATE INDEX proposal_link_tokens_token_idx ON proposal_link_tokens (token) WHERE NOT revoked"
    )

    # --- RLS --------------------------------------------------------------
    # rls-matrix.md hard line: anon gets no direct SELECT on proposals or
    # proposal_venues at all — the public link page (G5) reads through a
    # server-side lookup that validates the token first (app/routers
    # /public_proposals.py, using the service-role client), the same role
    # an edge function would play in a pure-Supabase stack.
    for table in ("proposals", "proposal_venues"):
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(
            f"""
            CREATE POLICY {table}_staff_all ON {table}
            FOR ALL
            USING (has_role('staff') OR has_role('admin'))
            WITH CHECK (has_role('staff') OR has_role('admin'))
            """
        )

    op.execute("ALTER TABLE proposal_link_tokens ENABLE ROW LEVEL SECURITY")
    op.execute(
        """
        CREATE POLICY proposal_link_tokens_staff_all ON proposal_link_tokens
        FOR ALL
        USING (has_role('staff') OR has_role('admin'))
        WITH CHECK (has_role('staff') OR has_role('admin'))
        """
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS proposal_link_tokens_staff_all ON proposal_link_tokens")
    op.execute("DROP POLICY IF EXISTS proposal_venues_staff_all ON proposal_venues")
    op.execute("DROP POLICY IF EXISTS proposals_staff_all ON proposals")

    op.execute("DROP TABLE IF EXISTS proposal_link_tokens")
    op.execute("DROP TABLE IF EXISTS proposal_venues")
    op.execute("DROP TABLE IF EXISTS proposals")
