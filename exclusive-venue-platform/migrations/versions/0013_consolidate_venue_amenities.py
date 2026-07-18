"""Consolidate venues.features into venues.amenities

Revision ID: 0013
Revises: 0012
Create Date: 2026-07-18

A schema audit (18 Jul, prompted by "are the columns complete for adding
venues?") found an `amenities text[]` column on venues already populated
with real, curated per-venue data (e.g. Victoria Harbour Yacht: "Open sun
deck", "Full bar", "Crew & captain", "Sound system") — but with no
migration anywhere in this repo that created it. It predates 0012's
`features` column, which duplicates the same concept and shipped without
noticing the existing one.

`amenities` wins: it already has good data, `features` does not (every
row was still the '[]' default). This migration is idempotent — safe to
run against a fresh database (where `amenities` doesn't exist yet and
this ADD COLUMN creates it) or against the shared dev database where it
already exists out-of-band (where IF NOT EXISTS is a no-op) — either way
the schema converges on the same shape.
"""

from alembic import op

revision = "0013"
down_revision = "0012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE venues ADD COLUMN IF NOT EXISTS amenities TEXT[] NOT NULL DEFAULT '{}'::text[]")
    op.execute("ALTER TABLE venues DROP COLUMN IF EXISTS features")


def downgrade() -> None:
    op.execute("ALTER TABLE venues ADD COLUMN IF NOT EXISTS features JSONB NOT NULL DEFAULT '[]'::jsonb")
    op.execute("ALTER TABLE venues DROP COLUMN IF EXISTS amenities")
