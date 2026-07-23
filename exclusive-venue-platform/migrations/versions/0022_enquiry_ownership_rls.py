"""enquiries/briefs RLS — per-salesperson row ownership

Revision ID: 0022
Revises: 0021
Create Date: 2026-07-22

Workflow overhaul follow-up: give each salesperson (role 'staff') a login
that only ever sees enquiries assigned to them, while 'admin' keeps full
visibility — per the client's ask ("other salespeople should have their
view"). Until now `staff` and `admin` were functionally identical in RLS
(0003_enquiry_intake.py's enquiries_staff_all: any staff-or-admin row in
user_roles saw every enquiry). `enquiries.assigned_to` has existed since
0003 but nothing ever populated or enforced it.

Mirrors the venues_landlord_*_own idiom from 0002_venue_domain.py rather
than inventing a new pattern. Split into per-command policies (not a
single FOR ALL) so a staff member's own UPDATE can't smuggle a reassignment
past the ownership check — the app layer (api/app/routers/enquiries.py)
only lets an admin change `assigned_to` at all, but this is what makes
that a real DB-enforced boundary, not just an app convention.

briefs has no assigned_to of its own — it inherits ownership from its
parent enquiry via a subquery, same relationship the app already treats
as authoritative (a brief is never shown independent of its enquiry).
No user_roles/profiles change needed: 'staff' and 'admin' already exist
as roles (0001_profiles_user_roles.py), and `profiles.full_name` already
extends auth.users 1:1 — this revision only changes what each role can
see, not who exists.
"""

from alembic import op

revision = "0022"
down_revision = "0021"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # --- enquiries ----------------------------------------------------
    op.execute("DROP POLICY IF EXISTS enquiries_staff_all ON enquiries")
    op.execute(
        """
        CREATE POLICY enquiries_admin_all ON enquiries
        FOR ALL
        USING (has_role('admin'))
        WITH CHECK (has_role('admin'))
        """
    )
    op.execute(
        """
        CREATE POLICY enquiries_staff_select_own ON enquiries
        FOR SELECT
        USING (has_role('staff') AND assigned_to = auth.uid())
        """
    )
    # Any staff member can create an enquiry (manual intake); the app
    # layer auto-assigns it to the creator on insert so they can see it
    # back under enquiries_staff_select_own immediately after.
    op.execute(
        """
        CREATE POLICY enquiries_staff_insert ON enquiries
        FOR INSERT
        WITH CHECK (has_role('staff'))
        """
    )
    op.execute(
        """
        CREATE POLICY enquiries_staff_update_own ON enquiries
        FOR UPDATE
        USING (has_role('staff') AND assigned_to = auth.uid())
        WITH CHECK (has_role('staff') AND assigned_to = auth.uid())
        """
    )
    # No staff DELETE policy — unchanged from before this revision.

    # --- briefs: ownership inherited from the parent enquiry -----------
    op.execute("DROP POLICY IF EXISTS briefs_staff_all ON briefs")
    op.execute(
        """
        CREATE POLICY briefs_admin_all ON briefs
        FOR ALL
        USING (has_role('admin'))
        WITH CHECK (has_role('admin'))
        """
    )
    op.execute(
        """
        CREATE POLICY briefs_staff_select_own ON briefs
        FOR SELECT
        USING (
            has_role('staff')
            AND EXISTS (
                SELECT 1 FROM enquiries e
                WHERE e.id = briefs.enquiry_id AND e.assigned_to = auth.uid()
            )
        )
        """
    )
    op.execute(
        """
        CREATE POLICY briefs_staff_insert_own ON briefs
        FOR INSERT
        WITH CHECK (
            has_role('staff')
            AND EXISTS (
                SELECT 1 FROM enquiries e
                WHERE e.id = briefs.enquiry_id AND e.assigned_to = auth.uid()
            )
        )
        """
    )
    op.execute(
        """
        CREATE POLICY briefs_staff_update_own ON briefs
        FOR UPDATE
        USING (
            has_role('staff')
            AND EXISTS (
                SELECT 1 FROM enquiries e
                WHERE e.id = briefs.enquiry_id AND e.assigned_to = auth.uid()
            )
        )
        WITH CHECK (
            has_role('staff')
            AND EXISTS (
                SELECT 1 FROM enquiries e
                WHERE e.id = briefs.enquiry_id AND e.assigned_to = auth.uid()
            )
        )
        """
    )


def downgrade() -> None:
    for policy in (
        "briefs_staff_update_own",
        "briefs_staff_insert_own",
        "briefs_staff_select_own",
        "briefs_admin_all",
    ):
        op.execute(f"DROP POLICY IF EXISTS {policy} ON briefs")
    op.execute(
        """
        CREATE POLICY briefs_staff_all ON briefs
        FOR ALL
        USING (has_role('staff') OR has_role('admin'))
        WITH CHECK (has_role('staff') OR has_role('admin'))
        """
    )

    for policy in (
        "enquiries_staff_update_own",
        "enquiries_staff_insert",
        "enquiries_staff_select_own",
        "enquiries_admin_all",
    ):
        op.execute(f"DROP POLICY IF EXISTS {policy} ON enquiries")
    op.execute(
        """
        CREATE POLICY enquiries_staff_all ON enquiries
        FOR ALL
        USING (has_role('staff') OR has_role('admin'))
        WITH CHECK (has_role('staff') OR has_role('admin'))
        """
    )
