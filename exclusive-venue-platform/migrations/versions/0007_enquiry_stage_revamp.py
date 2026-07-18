"""enquiries.stage: revamp to the 5-stage pipeline + lost

Revision ID: 0007
Revises: 0006
Create Date: 2026-07-18

Task H3 (specs/0001-product-1-core/tasks.md), decided 18 Jul after fuller
workflow context replaced the earlier 8-stage model. Schema per
erd.md §5.1 (superseding the resolution recorded there on 18 Jul earlier
the same day — see that section's history note).

Old stages: new, qualified, proposal_sent, follow_up, visit, negotiation,
confirmed, lost (8 values, built under task H1).

New stages: enquiry, briefed, proposed, held, signed, lost (6 values) —
Enquiry -> Briefed -> Proposed -> Held -> Signed is the client-facing
Kanban; lost is reachable from any non-terminal stage same as before,
just not a Kanban column (unchanged design from H1/H2).

Data migration (existing rows, if any):
    new            -> enquiry
    qualified      -> briefed    (staff confirmed the AI brief, matches
                                   the new model's Step 1 handoff)
    proposal_sent  -> proposed
    follow_up      -> proposed   (still awaiting client response, no
                                   hold established yet)
    visit          -> held       (site visit in progress reads closer to
                                   "actively holding" than "just sent")
    negotiation    -> held       (terms/hold being worked, same bucket)
    confirmed      -> signed
    lost           -> lost       (unchanged)

This mapping is lossy in one direction (proposal_sent + follow_up both
become "proposed"; visit + negotiation both become "held") — see
downgrade() for the best-effort reverse, which cannot recover the
original distinction.
"""

from alembic import op

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None

_FORWARD_MAP = {
    "new": "enquiry",
    "qualified": "briefed",
    "proposal_sent": "proposed",
    "follow_up": "proposed",
    "visit": "held",
    "negotiation": "held",
    "confirmed": "signed",
    "lost": "lost",
}

_BACKWARD_MAP = {
    "enquiry": "new",
    "briefed": "qualified",
    "proposed": "proposal_sent",
    "held": "negotiation",
    "signed": "confirmed",
    "lost": "lost",
}


def upgrade() -> None:
    # 1. Drop the old inline CHECK constraint FIRST. The remap in step 2
    #    writes new stage values ('enquiry', ...) that the 0003-era
    #    constraint forbids, so it has to be gone before any row is
    #    rewritten — otherwise the very first UPDATE trips the old guard.
    #    Postgres auto-named 0003's inline `CHECK (stage IN (...))` on the
    #    `stage` column deterministically as enquiries_stage_check (verified
    #    live), and stores it in `= ANY (ARRAY[...])` form — so a name-based
    #    DROP is both correct and immune to the IN-vs-ANY normalization that
    #    a pg_get_constraintdef text match would trip over.
    op.execute("ALTER TABLE enquiries DROP CONSTRAINT IF EXISTS enquiries_stage_check")

    # 2. Remap existing data. No CHECK constraint is in force here, so the
    #    intermediate state is unconstrained but never invalid-against-a-
    #    constraint; step 3 re-guards it once every row holds a new value.
    for old, new in _FORWARD_MAP.items():
        op.execute(f"UPDATE enquiries SET stage = '{new}' WHERE stage = '{old}'")

    # 3. New constraint + default, explicitly named this time.
    op.execute(
        """
        ALTER TABLE enquiries
        ADD CONSTRAINT enquiries_stage_check
        CHECK (stage IN ('enquiry', 'briefed', 'proposed', 'held', 'signed', 'lost'))
        """
    )
    op.execute("ALTER TABLE enquiries ALTER COLUMN stage SET DEFAULT 'enquiry'")


def downgrade() -> None:
    op.execute(
        """
        DO $$
        DECLARE
            con_name text;
        BEGIN
            SELECT conname INTO con_name
            FROM pg_constraint
            WHERE conrelid = 'enquiries'::regclass
              AND contype = 'c'
              AND pg_get_constraintdef(oid) ILIKE '%stage%IN%';
            IF con_name IS NOT NULL THEN
                EXECUTE format('ALTER TABLE enquiries DROP CONSTRAINT %I', con_name);
            END IF;
        END $$;
        """
    )
    op.execute(
        """
        ALTER TABLE enquiries
        ADD CONSTRAINT enquiries_stage_check
        CHECK (stage IN (
            'new', 'qualified', 'proposal_sent', 'follow_up',
            'visit', 'negotiation', 'confirmed', 'lost'
        ))
        """
    )
    op.execute("ALTER TABLE enquiries ALTER COLUMN stage SET DEFAULT 'new'")

    # Best-effort reverse — lossy, see module docstring.
    for new, old in _BACKWARD_MAP.items():
        op.execute(f"UPDATE enquiries SET stage = '{old}' WHERE stage = '{new}'")
