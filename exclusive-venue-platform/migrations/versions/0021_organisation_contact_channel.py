"""organisations.email/phone/parent_company — brand-level contact channel

Revision ID: 0019
Revises: 0018
Create Date: 2026-07-19

Task follow-up (contact page styling pass, client reference). The
reference's "Coordonnées" card attributes an email/phone/parent company
directly to the brand ("House of Dior" -> events.hk@dior.com, LVMH Group)
rather than to any one contact — a generic brand inbox/line and corporate
group are real, distinct facts from an individual contact's own details.
"auto-imported" (shown as a badge) is NOT a column: it's computed at
query time as "every contact on file for this org arrived via automatic
intake, none manually" — same computed-not-stored pattern as tier/lifetime
value elsewhere on this table.
"""

from alembic import op

revision = "0021"
down_revision = "0020"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE organisations
        ADD COLUMN IF NOT EXISTS email TEXT,
        ADD COLUMN IF NOT EXISTS phone TEXT,
        ADD COLUMN IF NOT EXISTS parent_company TEXT
        """
    )


def downgrade() -> None:
    op.execute(
        """
        ALTER TABLE organisations
        DROP COLUMN IF EXISTS email,
        DROP COLUMN IF EXISTS phone,
        DROP COLUMN IF EXISTS parent_company
        """
    )
