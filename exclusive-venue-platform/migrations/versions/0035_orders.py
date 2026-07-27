"""orders + RLS

Revision ID: 0035
Revises: 0034
Create Date: 2026-07-27

Task (plan.md §2, item 7). Schema per erd.md §6b — the widest-dependency
table in this product (contacts, vendors, vendor_services, commission_rules,
coupons, currencies all referenced), so it lands last among the schema
tables. Named `orders`, not `bookings`, to stay distinct from venue-side
booking/hold vocabulary (a naming call made explicitly during planning).

Guest checkout by default with an optional account (both explicitly
requested, not either/or): contact_id NOT NULL (always present, same
anonymous-friendly shape as enquiries), customer_user_id nullable (set
only if the orderer has/creates a 'customer'-role account).

An order can exist at status='pending' with zero linked `payments` rows —
explicitly required (a quote request or pay-later order), not an edge
case. No anon RLS policy at all: like enquiries (0003), the eventual
public order-creation path is a service-role/admin-client call from the
API layer (app-validated), not a direct anon PostgREST insert — there's
no Supabase Edge Function scaffolding in this repo, same pattern
public_proposals.py and the Resend webhook already use.
"""

from alembic import op

revision = "0035"
down_revision = "0034"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE orders (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            contact_id UUID NOT NULL REFERENCES contacts (id),
            customer_user_id UUID REFERENCES auth.users (id),
            vendor_id UUID NOT NULL REFERENCES vendors (id),
            vendor_service_id UUID REFERENCES vendor_services (id),
            event_date DATE,
            guest_count INTEGER CHECK (guest_count IS NULL OR guest_count > 0),
            subtotal_amount NUMERIC(12, 2) NOT NULL CHECK (subtotal_amount >= 0),
            coupon_id UUID REFERENCES coupons (id),
            discount_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
            total_amount NUMERIC(12, 2) NOT NULL CHECK (total_amount >= 0),
            currency TEXT NOT NULL REFERENCES currencies (code),
            commission_rules_id UUID NOT NULL REFERENCES commission_rules (id),
            commission_amount NUMERIC(12, 2) NOT NULL CHECK (commission_amount >= 0),
            payout_amount NUMERIC(12, 2) NOT NULL CHECK (payout_amount >= 0),
            status TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'confirmed', 'completed', 'canceled', 'refunded')),
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )
    op.execute("CREATE INDEX orders_vendor_id_idx ON orders (vendor_id)")
    op.execute("CREATE INDEX orders_contact_id_idx ON orders (contact_id)")
    op.execute("CREATE INDEX orders_customer_user_id_idx ON orders (customer_user_id)")
    op.execute(
        """
        CREATE TRIGGER orders_set_updated_at
        BEFORE UPDATE ON orders
        FOR EACH ROW
        EXECUTE FUNCTION set_updated_at()
        """
    )

    # --- RLS: no anon policy at all; staff ALL; vendor SELECT own -------
    op.execute("ALTER TABLE orders ENABLE ROW LEVEL SECURITY")
    op.execute(
        """
        CREATE POLICY orders_staff_all ON orders
        FOR ALL
        USING (has_role('staff') OR has_role('admin'))
        WITH CHECK (has_role('staff') OR has_role('admin'))
        """
    )
    op.execute(
        """
        CREATE POLICY orders_vendor_select_own ON orders
        FOR SELECT
        USING (EXISTS (
            SELECT 1 FROM vendors v WHERE v.id = orders.vendor_id AND v.owner_user_id = auth.uid()
        ))
        """
    )
    op.execute(
        """
        CREATE POLICY orders_customer_select_own ON orders
        FOR SELECT
        USING (customer_user_id = auth.uid())
        """
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS orders_customer_select_own ON orders")
    op.execute("DROP POLICY IF EXISTS orders_vendor_select_own ON orders")
    op.execute("DROP POLICY IF EXISTS orders_staff_all ON orders")
    op.execute("DROP TABLE IF EXISTS orders")
