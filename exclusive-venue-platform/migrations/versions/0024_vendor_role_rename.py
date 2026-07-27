"""user_roles.role: rename 'supplier' -> 'vendor'

Revision ID: 0024
Revises: 0023
Create Date: 2026-07-27

Decided in-session while scoping Product 4 (specs/0004-vendor-marketplace):
"supplier" reads as B2B/procurement vocabulary, whereas the events
industry standard term for an external service provider (florist,
caterer, AV, staffing, decor) is "vendor" — matches the client-facing
language the marketplace will actually use. No supplier_* tables have
been migrated yet (Product 4 schema is still spec-only, per erd.md §10),
so this is the one live-migration touchpoint: the 'supplier' value baked
into 0001's user_roles CHECK constraint. Every other supplier_* ->
vendor_* rename (tables, RLS policies, routes, docs) is free at this
point and handled directly in specs/0000-foundation/erd.md and
rls-matrix.md — nothing else needs a migration.

Same drop-constraint-by-name / remap-rows / re-add-constraint pattern as
0007 (enquiries.stage revamp) — Postgres auto-names 0001's inline
CHECK on user_roles.role deterministically as user_roles_role_check.
"""

from alembic import op

revision = "0024"
down_revision = "0023"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Drop the old constraint first — the remap below writes 'vendor',
    #    which the 0001-era constraint (still listing 'supplier') forbids.
    op.execute("ALTER TABLE user_roles DROP CONSTRAINT IF EXISTS user_roles_role_check")

    # 2. Remap existing rows, if any (pilot/testing accounts may already
    #    hold the 'supplier' role per erd.md §11's live-validation note).
    op.execute("UPDATE user_roles SET role = 'vendor' WHERE role = 'supplier'")

    # 3. New constraint, adding 'customer' at the same time (Product 4's
    #    optional marketplace-account role, erd.md §6b) since both changes
    #    land together rather than as two back-to-back ALTERs.
    op.execute(
        """
        ALTER TABLE user_roles
        ADD CONSTRAINT user_roles_role_check
        CHECK (role IN ('staff', 'admin', 'landlord', 'vendor', 'customer'))
        """
    )


def downgrade() -> None:
    op.execute(
        """
        DO $$
        DECLARE
            con_name text;
        BEGIN
            SELECT conname INTO con_name
            FROM pg_constraint
            WHERE conrelid = 'user_roles'::regclass
              AND contype = 'c'
              AND pg_get_constraintdef(oid) ILIKE '%role%IN%';
            IF con_name IS NOT NULL THEN
                EXECUTE format('ALTER TABLE user_roles DROP CONSTRAINT %I', con_name);
            END IF;
        END $$;
        """
    )
    op.execute(
        """
        ALTER TABLE user_roles
        ADD CONSTRAINT user_roles_role_check
        CHECK (role IN ('staff', 'admin', 'landlord', 'supplier'))
        """
    )
    op.execute("UPDATE user_roles SET role = 'supplier' WHERE role = 'vendor'")
    op.execute("DELETE FROM user_roles WHERE role = 'customer'")
