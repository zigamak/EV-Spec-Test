"""venues — detail fields for the redesigned Venue Profile page

Revision ID: 0014
Revises: 0013
Create Date: 2026-07-18

Task B3 follow-up — the "Operator View" profile redesign (client reference,
18 Jul) needs a few more descriptive venue-level fields:
  - surface_area_sqft, room_count: shown as capacity stat cards alongside
    the existing standing/sitting numbers, which stay modeled as named
    venue_configurations rows (that table already exists to hold exactly
    this — a dedicated column would just duplicate it).
  - access_note, view_note: free text for the profile's info card
    ("Access: By sampan only · car-free", "View: Ocean · garden · mountain").
  - ideal_for, accepted_event_types: two distinct tag lists (where the venue
    shines vs. the full list of formats it supports) — same JSONB-array-on-
    the-row pattern as amenities (0013), kept separate since they answer
    different questions and a proposal-builder filter may want only one.
All nullable/empty-default: existing venues show honest empty states
until an operator fills these in, never a fabricated value.
"""

from alembic import op

revision = "0014"
down_revision = "0013"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE venues
        ADD COLUMN surface_area_sqft NUMERIC,
        ADD COLUMN room_count INTEGER,
        ADD COLUMN access_note TEXT,
        ADD COLUMN view_note TEXT,
        ADD COLUMN ideal_for TEXT[] NOT NULL DEFAULT '{}',
        ADD COLUMN accepted_event_types TEXT[] NOT NULL DEFAULT '{}'
        """
    )


def downgrade() -> None:
    op.execute(
        """
        ALTER TABLE venues
        DROP COLUMN IF EXISTS surface_area_sqft,
        DROP COLUMN IF EXISTS room_count,
        DROP COLUMN IF EXISTS access_note,
        DROP COLUMN IF EXISTS view_note,
        DROP COLUMN IF EXISTS ideal_for,
        DROP COLUMN IF EXISTS accepted_event_types
        """
    )
