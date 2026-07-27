"""vendors, vendor_media, vendor_tags, vendor_subscriptions, proposal_vendors + RLS

Revision ID: 0030
Revises: 0029
Create Date: 2026-07-27

Task (specs/0004-vendor-marketplace/plan.md §2, item 1). Schema per
erd.md §6 — the base marketplace domain, built fresh under the renamed
"vendor" vocabulary from day one (these tables were never migrated under
the old "supplier" name, so there's no rename debt here, unlike
migration 0024's user_roles CHECK constraint).

Location + SEO fields on `vendors` (address/district/city/region/
latitude/longitude/service_area_radius_km, meta_title/meta_description)
are new relative to the original supplier-marketplace design — added per
the explicit "as detailed as possible... every detail a platform would
need to grow" requirement, so the public directory can actually support
location/distance search and be SEO-indexable per vendor page.

Same approval-before-live mechanic as venues (0002): a vendor cannot
self-activate, status starts 'draft'/'pending_approval', only staff sets
'active'.
"""

from alembic import op

revision = "0030"
down_revision = "0029"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE vendors (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            owner_user_id UUID NOT NULL REFERENCES auth.users (id),
            business_name TEXT NOT NULL,
            slug TEXT NOT NULL UNIQUE,
            category TEXT NOT NULL CHECK (category IN (
                'florist', 'catering', 'lighting', 'entertainment',
                'av', 'staffing', 'decor', 'other'
            )),
            description TEXT,
            contacts TEXT,
            address TEXT,
            district TEXT,
            city TEXT,
            region TEXT,
            latitude NUMERIC(9, 6),
            longitude NUMERIC(9, 6),
            service_area_radius_km NUMERIC(6, 1),
            meta_title TEXT,
            meta_description TEXT,
            status TEXT NOT NULL DEFAULT 'draft'
                CHECK (status IN ('draft', 'pending_approval', 'active', 'suspended')),
            approved_by UUID REFERENCES auth.users (id),
            approved_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )
    op.execute("CREATE INDEX vendors_owner_user_id_idx ON vendors (owner_user_id)")
    op.execute("CREATE INDEX vendors_status_idx ON vendors (status) WHERE status = 'active'")
    op.execute("CREATE INDEX vendors_category_idx ON vendors (category) WHERE status = 'active'")
    op.execute(
        """
        CREATE TRIGGER vendors_set_updated_at
        BEFORE UPDATE ON vendors
        FOR EACH ROW
        EXECUTE FUNCTION set_updated_at()
        """
    )

    op.execute(
        """
        CREATE TABLE vendor_media (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            vendor_id UUID NOT NULL REFERENCES vendors (id) ON DELETE CASCADE,
            storage_path TEXT NOT NULL,
            kind TEXT NOT NULL CHECK (kind IN ('photo', 'video', 'logo')),
            sort_order INTEGER NOT NULL DEFAULT 0,
            caption TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )
    op.execute("CREATE INDEX vendor_media_vendor_id_idx ON vendor_media (vendor_id)")

    op.execute(
        """
        CREATE TABLE vendor_tags (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            vendor_id UUID NOT NULL REFERENCES vendors (id) ON DELETE CASCADE,
            tag TEXT NOT NULL,
            UNIQUE (vendor_id, tag)
        )
        """
    )

    op.execute(
        """
        CREATE TABLE vendor_subscriptions (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            vendor_id UUID NOT NULL REFERENCES vendors (id) ON DELETE CASCADE,
            stripe_customer_id TEXT,
            stripe_subscription_id TEXT UNIQUE,
            tier TEXT NOT NULL DEFAULT 'standard' CHECK (tier IN ('standard', 'featured')),
            status TEXT NOT NULL DEFAULT 'incomplete'
                CHECK (status IN ('active', 'past_due', 'canceled', 'incomplete')),
            current_period_end TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )
    op.execute("CREATE INDEX vendor_subscriptions_vendor_id_idx ON vendor_subscriptions (vendor_id)")
    op.execute(
        """
        CREATE TRIGGER vendor_subscriptions_set_updated_at
        BEFORE UPDATE ON vendor_subscriptions
        FOR EACH ROW
        EXECUTE FUNCTION set_updated_at()
        """
    )

    op.execute(
        """
        CREATE TABLE proposal_vendors (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            proposal_id UUID NOT NULL REFERENCES proposals (id) ON DELETE CASCADE,
            vendor_id UUID NOT NULL REFERENCES vendors (id),
            sort_order INTEGER NOT NULL DEFAULT 0
        )
        """
    )
    op.execute("CREATE INDEX proposal_vendors_proposal_id_idx ON proposal_vendors (proposal_id)")

    # --- RLS (rls-matrix.md) ----------------------------------------------
    # vendors/media/tags: anon SELECT where active AND subscription active;
    # staff ALL; vendor SELECT/UPDATE own, cannot self-activate.
    op.execute("ALTER TABLE vendors ENABLE ROW LEVEL SECURITY")
    op.execute(
        """
        CREATE POLICY vendors_anon_select_active ON vendors
        FOR SELECT
        USING (
            status = 'active'
            AND EXISTS (
                SELECT 1 FROM vendor_subscriptions vs
                WHERE vs.vendor_id = vendors.id AND vs.status = 'active'
            )
        )
        """
    )
    op.execute(
        """
        CREATE POLICY vendors_staff_all ON vendors
        FOR ALL
        USING (has_role('staff') OR has_role('admin'))
        WITH CHECK (has_role('staff') OR has_role('admin'))
        """
    )
    op.execute(
        """
        CREATE POLICY vendors_vendor_select_own ON vendors
        FOR SELECT
        USING (owner_user_id = auth.uid())
        """
    )
    op.execute(
        """
        CREATE POLICY vendors_vendor_insert_own ON vendors
        FOR INSERT
        WITH CHECK (owner_user_id = auth.uid() AND status IN ('draft', 'pending_approval'))
        """
    )
    op.execute(
        """
        CREATE POLICY vendors_vendor_update_own ON vendors
        FOR UPDATE
        USING (owner_user_id = auth.uid())
        WITH CHECK (owner_user_id = auth.uid() AND status IN ('draft', 'pending_approval'))
        """
    )

    for table in ("vendor_media", "vendor_tags"):
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(
            f"""
            CREATE POLICY {table}_anon_select ON {table}
            FOR SELECT
            USING (EXISTS (
                SELECT 1 FROM vendors v
                JOIN vendor_subscriptions vs ON vs.vendor_id = v.id
                WHERE v.id = {table}.vendor_id AND v.status = 'active' AND vs.status = 'active'
            ))
            """
        )
        op.execute(
            f"""
            CREATE POLICY {table}_staff_all ON {table}
            FOR ALL
            USING (has_role('staff') OR has_role('admin'))
            WITH CHECK (has_role('staff') OR has_role('admin'))
            """
        )
        op.execute(
            f"""
            CREATE POLICY {table}_vendor_all_own ON {table}
            FOR ALL
            USING (EXISTS (
                SELECT 1 FROM vendors v WHERE v.id = {table}.vendor_id AND v.owner_user_id = auth.uid()
            ))
            WITH CHECK (EXISTS (
                SELECT 1 FROM vendors v WHERE v.id = {table}.vendor_id AND v.owner_user_id = auth.uid()
            ))
            """
        )

    # vendor_subscriptions: staff ALL, vendor SELECT own, no anon.
    op.execute("ALTER TABLE vendor_subscriptions ENABLE ROW LEVEL SECURITY")
    op.execute(
        """
        CREATE POLICY vendor_subscriptions_staff_all ON vendor_subscriptions
        FOR ALL
        USING (has_role('staff') OR has_role('admin'))
        WITH CHECK (has_role('staff') OR has_role('admin'))
        """
    )
    op.execute(
        """
        CREATE POLICY vendor_subscriptions_vendor_select_own ON vendor_subscriptions
        FOR SELECT
        USING (EXISTS (
            SELECT 1 FROM vendors v WHERE v.id = vendor_subscriptions.vendor_id AND v.owner_user_id = auth.uid()
        ))
        """
    )

    # proposal_vendors: staff ALL only (mirrors proposals/proposal_venues —
    # anon reads proposals via the token RPC, never this table directly).
    op.execute("ALTER TABLE proposal_vendors ENABLE ROW LEVEL SECURITY")
    op.execute(
        """
        CREATE POLICY proposal_vendors_staff_all ON proposal_vendors
        FOR ALL
        USING (has_role('staff') OR has_role('admin'))
        WITH CHECK (has_role('staff') OR has_role('admin'))
        """
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS proposal_vendors_staff_all ON proposal_vendors")
    op.execute("DROP TABLE IF EXISTS proposal_vendors")

    op.execute("DROP POLICY IF EXISTS vendor_subscriptions_vendor_select_own ON vendor_subscriptions")
    op.execute("DROP POLICY IF EXISTS vendor_subscriptions_staff_all ON vendor_subscriptions")
    op.execute("DROP TABLE IF EXISTS vendor_subscriptions")

    for table in ("vendor_tags", "vendor_media"):
        op.execute(f"DROP POLICY IF EXISTS {table}_vendor_all_own ON {table}")
        op.execute(f"DROP POLICY IF EXISTS {table}_staff_all ON {table}")
        op.execute(f"DROP POLICY IF EXISTS {table}_anon_select ON {table}")
        op.execute(f"DROP TABLE IF EXISTS {table}")

    op.execute("DROP POLICY IF EXISTS vendors_vendor_update_own ON vendors")
    op.execute("DROP POLICY IF EXISTS vendors_vendor_insert_own ON vendors")
    op.execute("DROP POLICY IF EXISTS vendors_vendor_select_own ON vendors")
    op.execute("DROP POLICY IF EXISTS vendors_staff_all ON vendors")
    op.execute("DROP POLICY IF EXISTS vendors_anon_select_active ON vendors")
    op.execute("DROP TABLE IF EXISTS vendors")
