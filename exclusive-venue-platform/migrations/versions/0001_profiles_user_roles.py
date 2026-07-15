"""profiles, user_roles + has_role() helper + RLS

Revision ID: 0001
Revises:
Create Date: 2026-07-12

Task A1 (specs/0001-product-1-core/tasks.md) — the one cross-cutting
migration in group A. has_role() gates every RLS policy that comes after
it (erd.md §3, §10). Hand-written per docs/stack-profile.md: autogenerate
does not infer RLS/CHECK intent.
"""

from alembic import op

# revision identifiers, used by Alembic.
revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # --- profiles ---------------------------------------------------------
    # Extends Supabase auth.users 1:1. id PK = auth.users.id. Never store
    # auth data (password, email) here — that lives in auth.users.
    op.execute(
        """
        CREATE TABLE profiles (
            id UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
            full_name TEXT,
            phone TEXT,
            avatar_url TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )

    # --- user_roles ---------------------------------------------------------
    # One row per role grant. A user can hold multiple roles (erd.md §3 —
    # multi-role users, and pilot-phase testing as all three roles, break a
    # single role column on profiles immediately).
    op.execute(
        """
        CREATE TABLE user_roles (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
            role TEXT NOT NULL CHECK (role IN ('staff', 'admin', 'landlord', 'supplier')),
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            UNIQUE (user_id, role)
        )
        """
    )
    op.execute("CREATE INDEX user_roles_user_id_idx ON user_roles (user_id)")

    # --- has_role() helper --------------------------------------------------
    # RLS anchor: every policy in every subsequent revision calls this
    # instead of re-deriving a role check inline (erd.md §3, rls-matrix.md).
    # SECURITY DEFINER + fixed search_path so it can read user_roles even
    # under a caller whose own RLS would otherwise block the read; STABLE so
    # the planner can cache it within a statement.
    op.execute(
        """
        CREATE OR REPLACE FUNCTION has_role(target_role TEXT)
        RETURNS BOOLEAN
        LANGUAGE sql
        STABLE
        SECURITY DEFINER
        SET search_path = public
        AS $$
            SELECT EXISTS (
                SELECT 1
                FROM user_roles
                WHERE user_id = auth.uid()
                  AND role = target_role
            )
        $$
        """
    )

    # --- updated_at trigger for profiles -------------------------------
    op.execute(
        """
        CREATE OR REPLACE FUNCTION set_updated_at()
        RETURNS TRIGGER
        LANGUAGE plpgsql
        AS $$
        BEGIN
            NEW.updated_at = now();
            RETURN NEW;
        END;
        $$
        """
    )
    op.execute(
        """
        CREATE TRIGGER profiles_set_updated_at
        BEFORE UPDATE ON profiles
        FOR EACH ROW
        EXECUTE FUNCTION set_updated_at()
        """
    )

    # --- RLS: profiles -------------------------------------------------
    # rls-matrix.md: anon —; staff/admin ALL; landlord/supplier SELECT own.
    op.execute("ALTER TABLE profiles ENABLE ROW LEVEL SECURITY")
    op.execute(
        """
        CREATE POLICY profiles_staff_all ON profiles
        FOR ALL
        USING (has_role('staff') OR has_role('admin'))
        WITH CHECK (has_role('staff') OR has_role('admin'))
        """
    )
    op.execute(
        """
        CREATE POLICY profiles_select_own ON profiles
        FOR SELECT
        USING (id = auth.uid())
        """
    )

    # --- RLS: user_roles -------------------------------------------------
    # rls-matrix.md: anon —; staff/admin ALL; landlord/supplier SELECT own.
    op.execute("ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY")
    op.execute(
        """
        CREATE POLICY user_roles_staff_all ON user_roles
        FOR ALL
        USING (has_role('staff') OR has_role('admin'))
        WITH CHECK (has_role('staff') OR has_role('admin'))
        """
    )
    op.execute(
        """
        CREATE POLICY user_roles_select_own ON user_roles
        FOR SELECT
        USING (user_id = auth.uid())
        """
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS user_roles_select_own ON user_roles")
    op.execute("DROP POLICY IF EXISTS user_roles_staff_all ON user_roles")
    op.execute("DROP POLICY IF EXISTS profiles_select_own ON profiles")
    op.execute("DROP POLICY IF EXISTS profiles_staff_all ON profiles")
    op.execute("DROP TRIGGER IF EXISTS profiles_set_updated_at ON profiles")
    op.execute("DROP FUNCTION IF EXISTS set_updated_at()")
    op.execute("DROP FUNCTION IF EXISTS has_role(TEXT)")
    op.execute("DROP TABLE IF EXISTS user_roles")
    op.execute("DROP TABLE IF EXISTS profiles")
