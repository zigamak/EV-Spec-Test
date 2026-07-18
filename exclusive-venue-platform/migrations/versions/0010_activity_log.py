"""activity_log — append-only audit trail (who/what/when, AI or human)

Revision ID: 0010
Revises: 0009
Create Date: 2026-07-18

Task K1 — an audit trail for everything that happens to an enquiry/brief/
proposal, whether an AI step or a human action did it, plus errors. This is
how the operator answers "who changed this budget?", "did the AI or a human
set this date?", and "what failed at 14:22?".

Design (standard append-only audit pattern — see the module note in
app/services/activity_log.py for the production rationale):
  - actor_type: human | ai | system, with actor_id (auth.users FK) for
    humans and actor_label for the AI model / system component.
  - action is a dotted verb ('brief.parsed', 'brief.edited',
    'enquiry.forwarded', 'proposal.created', 'brief.parse_failed').
  - entity_type/entity_id point at the thing acted on; enquiry_id is
    denormalized so a per-enquiry timeline is one indexed query.
  - level (info/warning/error) so failures are queryable, not just prose.
  - metadata jsonb carries the specifics (a field diff, an error message).

Rows are never updated or deleted by the app — an audit trail you can edit
isn't an audit trail. RLS: staff/admin read + insert; the service-role
client (AI/system/webhook writes) bypasses RLS as everywhere else.
"""

from alembic import op

revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE activity_log (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            actor_type TEXT NOT NULL CHECK (actor_type IN ('human', 'ai', 'system')),
            actor_id UUID REFERENCES auth.users (id) ON DELETE SET NULL,
            actor_label TEXT,
            action TEXT NOT NULL,
            entity_type TEXT,
            entity_id UUID,
            enquiry_id UUID REFERENCES enquiries (id) ON DELETE CASCADE,
            level TEXT NOT NULL DEFAULT 'info' CHECK (level IN ('info', 'warning', 'error')),
            summary TEXT,
            metadata JSONB NOT NULL DEFAULT '{}'::jsonb
        )
        """
    )
    op.execute(
        "CREATE INDEX activity_log_enquiry_id_idx ON activity_log (enquiry_id, created_at DESC)"
    )
    op.execute("CREATE INDEX activity_log_created_at_idx ON activity_log (created_at DESC)")

    op.execute("ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY")
    op.execute(
        """
        CREATE POLICY activity_log_staff_read ON activity_log
        FOR SELECT
        USING (has_role('staff') OR has_role('admin'))
        """
    )
    op.execute(
        """
        CREATE POLICY activity_log_staff_insert ON activity_log
        FOR INSERT
        WITH CHECK (has_role('staff') OR has_role('admin'))
        """
    )
    # Deliberately no UPDATE or DELETE policy: append-only. Even staff can't
    # rewrite history through the scoped client; corrections are new rows.


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS activity_log_staff_insert ON activity_log")
    op.execute("DROP POLICY IF EXISTS activity_log_staff_read ON activity_log")
    op.execute("DROP TABLE IF EXISTS activity_log")
