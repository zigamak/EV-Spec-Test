"""venues.features — free-form amenity/feature tags (Add Venue redesign)

Revision ID: 0012
Revises: 0011
Create Date: 2026-07-18

Task B4 follow-up — the richer "Add venue" flow needs a way to record
amenities (AV equipment, rooftop, parking, etc). Unlike venue_restrictions
(a fixed enum of hard/soft constraints the recommendation engine reasons
over), features are purely descriptive, so a JSONB string array on the
venues row follows the existing convention (briefs.flagged_fields,
briefs.date_suggestions) rather than a new join table.

Superseded by 0013: this duplicated a pre-existing, already-populated
`amenities` column that predated this migration but was never itself
committed as a migration (found during a schema audit, 18 Jul). 0013
drops this column and formalizes `amenities` as the one true column —
left here rather than rewritten so the revision chain some environments
already applied this against stays valid.
"""

from alembic import op

revision = "0012"
down_revision = "0011"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE venues ADD COLUMN features JSONB NOT NULL DEFAULT '[]'::jsonb")


def downgrade() -> None:
    op.execute("ALTER TABLE venues DROP COLUMN IF EXISTS features")
