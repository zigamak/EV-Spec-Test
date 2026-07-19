"""venues.category — portfolio category ribbon (Venue Library redesign)

Revision ID: 0011
Revises: 0010
Create Date: 2026-07-18

Task B3 follow-up — the category ribbon (Event Spaces / Private Property /
Commercial Space / Boats & Yachts / Member Clubs) from the client reference
screenshot was deferred in tasks.md pending this column (no fabricated
filters against real data). Nullable: existing venues are uncategorized
until an operator sets one via the edit form: not backfilled with a guess.
"""

from alembic import op

revision = "0013"
down_revision = "0012"
branch_labels = None
depends_on = None

CATEGORIES = (
    "event_space",
    "private_property",
    "commercial_space",
    "boats_yachts",
    "member_club",
)


def upgrade() -> None:
    op.execute(
        f"""
        ALTER TABLE venues
        ADD COLUMN category TEXT
        CHECK (category IN ({", ".join(f"'{c}'" for c in CATEGORIES)}))
        """
    )
    op.execute("CREATE INDEX venues_category_idx ON venues (category)")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS venues_category_idx")
    op.execute("ALTER TABLE venues DROP COLUMN IF EXISTS category")
