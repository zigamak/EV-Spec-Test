"""contacts.source: add 'marketplace'

Revision ID: 0039
Revises: 0038
Create Date: 2026-07-27

Product 4's order intake (task in plan.md §3, POST /orders) finds-or-
creates a contact for a guest orderer, same pattern webhooks.py already
uses for inbound email. None of the existing source values accurately
describe "came from placing a marketplace order" — reusing 'web_form'
would misrepresent the actual channel for reporting purposes, so this
adds a genuine new value instead, same small-ALTER pattern 0008 used to
add 'whatsapp'.
"""

from alembic import op

revision = "0039"
down_revision = "0038"
branch_labels = None
depends_on = None


def _replace_check(table: str, column: str, constraint_name: str, new_check_sql: str) -> None:
    op.execute(f"ALTER TABLE {table} DROP CONSTRAINT IF EXISTS {constraint_name}")
    op.execute(f"ALTER TABLE {table} ADD CONSTRAINT {constraint_name} CHECK ({new_check_sql})")


def upgrade() -> None:
    _replace_check(
        "contacts", "source", "contacts_source_check",
        "source IN ('email', 'web_form', 'concierge', 'manual', 'whatsapp', 'marketplace')",
    )


def downgrade() -> None:
    _replace_check(
        "contacts", "source", "contacts_source_check",
        "source IN ('email', 'web_form', 'concierge', 'manual', 'whatsapp')",
    )
