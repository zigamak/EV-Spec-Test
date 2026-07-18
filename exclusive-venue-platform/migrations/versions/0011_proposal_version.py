"""proposals.version — per-enquiry proposal version number

Revision ID: 0011
Revises: 0010
Create Date: 2026-07-18

The "one draft per enquiry, versions after sent" model (decided 18 Jul):
each enquiry keeps a single working draft; once a proposal is sent, building
again starts a NEW proposal — a new version. `version` numbers those within
an enquiry (v1, v2, …) so the list can show which revision a proposal is.

Backfilled by created_at order within each enquiry. Not globally unique —
scoped per enquiry; gaps are fine (a deleted duplicate leaves a gap, which
is harmless for an identifier).
"""

from alembic import op

revision = "0011"
down_revision = "0010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE proposals ADD COLUMN version INTEGER NOT NULL DEFAULT 1")
    op.execute(
        """
        WITH ranked AS (
            SELECT id, row_number() OVER (
                PARTITION BY enquiry_id ORDER BY created_at, id
            ) AS rn
            FROM proposals
        )
        UPDATE proposals p SET version = ranked.rn
        FROM ranked
        WHERE ranked.id = p.id
        """
    )


def downgrade() -> None:
    op.execute("ALTER TABLE proposals DROP COLUMN IF EXISTS version")
