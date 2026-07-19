"""briefs.catering + decision_by, venues.amenities — richer proposal doc

Revision ID: 0012
Revises: 0011
Create Date: 2026-07-18

Fields the detailed client-facing proposal document (task G4) needs but the
schema didn't model:
  - briefs.catering    — catering brief, e.g. "Light bites · champagne".
  - briefs.decision_by — the client's decision deadline (drives urgency copy).
  - venues.amenities   — a venue's feature list (e.g. "Catering kitchen",
                         "Loading bay", "Floor-to-ceiling glass") shown as the
                         bullets on each option. TEXT[] (native array), same
                         pattern as other list columns; validated in code.

All nullable / defaulted, so existing rows stay valid; seeded with demo data
separately.
"""

from alembic import op

revision = "0012"
down_revision = "0011"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE briefs ADD COLUMN catering TEXT, ADD COLUMN decision_by DATE")
    op.execute("ALTER TABLE venues ADD COLUMN amenities TEXT[] NOT NULL DEFAULT '{}'")


def downgrade() -> None:
    op.execute("ALTER TABLE venues DROP COLUMN IF EXISTS amenities")
    op.execute("ALTER TABLE briefs DROP COLUMN IF EXISTS decision_by")
    op.execute("ALTER TABLE briefs DROP COLUMN IF EXISTS catering")
