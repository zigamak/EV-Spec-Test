"""landlord_invites.venue_id + auto-link trigger on auth.users

Revision ID: 0029
Revises: 0028
Create Date: 2026-07-27

Closes the gap flagged in tasks.md B3: an invite accepted through
Supabase Auth happens entirely outside FastAPI (no endpoint of ours runs
when a user sets their password) — a Postgres trigger on auth.users is
the only place that moment is actually observable. When a new auth.users
row's email matches a pending landlord_invites row:
  1. grants the 'landlord' role (user_roles), if not already held
  2. marks the invite 'accepted' + accepted_at
  3. if the invite was tied to a specific venue (Path A, prd.md §4),
     claims that venue's landlord_id — but only if it's still unclaimed
     (`landlord_id IS NULL`), so a race against a second invite/manual
     assignment can't silently overwrite an existing owner.

Path B (a landlord adding their own venue after accepting a
venue-less invite) needs no trigger involvement — venues_landlord_
insert_own already lets them set landlord_id = their own auth.uid()
directly.

CI's auth.users stub (.github/workflows/ci.yml) gained an `email` column
alongside this migration — the trigger function reads NEW.email, which
a bare `id`-only stub table doesn't have.
"""

from alembic import op

revision = "0029"
down_revision = "0028"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE landlord_invites ADD COLUMN venue_id UUID REFERENCES venues (id)"
    )

    op.execute(
        """
        CREATE OR REPLACE FUNCTION handle_landlord_invite_acceptance()
        RETURNS TRIGGER AS $$
        DECLARE
            matched_invite landlord_invites%ROWTYPE;
        BEGIN
            SELECT * INTO matched_invite
            FROM landlord_invites
            WHERE email = NEW.email AND status = 'pending'
            ORDER BY invited_at DESC
            LIMIT 1;

            IF matched_invite.id IS NULL THEN
                RETURN NEW;
            END IF;

            INSERT INTO user_roles (user_id, role)
            VALUES (NEW.id, 'landlord')
            ON CONFLICT (user_id, role) DO NOTHING;

            UPDATE landlord_invites
            SET status = 'accepted', accepted_at = now()
            WHERE id = matched_invite.id;

            IF matched_invite.venue_id IS NOT NULL THEN
                UPDATE venues
                SET landlord_id = NEW.id
                WHERE id = matched_invite.venue_id AND landlord_id IS NULL;
            END IF;

            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
        """
    )
    op.execute(
        """
        CREATE TRIGGER on_auth_user_created_landlord_invite
        AFTER INSERT ON auth.users
        FOR EACH ROW
        EXECUTE FUNCTION handle_landlord_invite_acceptance()
        """
    )


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS on_auth_user_created_landlord_invite ON auth.users")
    op.execute("DROP FUNCTION IF EXISTS handle_landlord_invite_acceptance()")
    op.execute("ALTER TABLE landlord_invites DROP COLUMN IF EXISTS venue_id")
