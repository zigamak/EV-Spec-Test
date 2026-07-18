"""enquiries: forwarded_to + forward_note (team hand-off)

Revision ID: 0009
Revises: 0008
Create Date: 2026-07-18

Task H5 — the reference "Forward to" panel. enquiries.assigned_to is an
auth.users FK (real staff assignment, 0003). This adds a lighter,
display-level hand-off alongside it:

  forwarded_to  — the team member the enquiry was routed to, by name. NOT
                  an auth.users FK: the operator's colleagues (Account
                  Directors, GM, Chairman) may not all have platform logins,
                  so this is a plain label, not an identity.
  forward_note  — the optional line of context that "becomes part of the
                  client timeline" (from the reference UI).

Both nullable, no backfill — existing rows are simply un-forwarded. RLS on
enquiries (0003) already covers these columns; adding columns needs no new
policy.
"""

from alembic import op

revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE enquiries
            ADD COLUMN forwarded_to TEXT,
            ADD COLUMN forward_note TEXT
        """
    )


def downgrade() -> None:
    op.execute("ALTER TABLE enquiries DROP COLUMN IF EXISTS forward_note")
    op.execute("ALTER TABLE enquiries DROP COLUMN IF EXISTS forwarded_to")
