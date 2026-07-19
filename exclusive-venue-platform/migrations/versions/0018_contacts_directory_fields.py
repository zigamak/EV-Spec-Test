"""organisations.website/address/notes, contacts.role — Contacts directory

Revision ID: 0018
Revises: 0017
Create Date: 2026-07-19

erd.md §5 already flagged "a dedicated Contacts page (browse/search
independent of an enquiry)" as scoped-but-unbuilt UI; this is the schema
side of finally building it (client reference, 19 Jul). Lifetime value /
enquiry counts stay computed at query time (same pattern as
organisations.tier's docstring already establishes) — only genuinely
descriptive, operator-entered fields become columns:
  - organisations.website, .address: real company-level facts, distinct
    from any one contact's own details.
  - organisations.notes: shared team notes on the client relationship.
  - contacts.role: job title (e.g. "Communications Director") — shown
    next to a contact's name throughout the directory.
All nullable/empty: existing rows show honest blanks until an operator
fills them in.
"""

from alembic import op

revision = "0018"
down_revision = "0017"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE organisations
        ADD COLUMN website TEXT,
        ADD COLUMN address TEXT,
        ADD COLUMN notes TEXT
        """
    )
    op.execute("ALTER TABLE contacts ADD COLUMN role TEXT")


def downgrade() -> None:
    op.execute(
        """
        ALTER TABLE organisations
        DROP COLUMN IF EXISTS website,
        DROP COLUMN IF EXISTS address,
        DROP COLUMN IF EXISTS notes
        """
    )
    op.execute("ALTER TABLE contacts DROP COLUMN IF EXISTS role")
