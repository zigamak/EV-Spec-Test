# Plan — Product 4: Vendor Marketplace

*Generated from `prd.md` + `specs/0000-foundation/erd.md` §6, §6b, §7 (schema of record). Per CLAUDE.md, this is reviewed output, not hand-written from scratch. Build window: Week 6 onward, alongside Product 3.*

## 1. Dependency order

Unlike Product 3, Product 4's core domain tables (`vendors`, `vendor_media`, `vendor_tags`, `vendor_subscriptions`, `proposal_vendors`) are **not yet migrated at all** — per `erd.md` §10 they're cut fresh in Week 6, not part of the Product 1 sequence. So this plan has more ground-up schema work than Product 3 did:

1. **`vendors` → `vendor_media` → `vendor_tags` → `vendor_subscriptions` → `proposal_vendors`** (erd.md §6, existing design, includes the new location/SEO fields on `vendors`) — the base marketplace domain, build order unchanged from §10.
2. **`currencies`** — depends on Product 3's migration landing first (or being brought forward together; sequencing decision flagged in PRD §9). `vendor_services.currency`/`commission_rules.currency`/`orders.currency`/`coupons.currency` all need it.
3. **`vendor_services`** — depends on `vendors` + `currencies`.
4. **`payment_methods`** — no dependencies, seed with `('stripe', 'Stripe', true)`.
5. **`commission_rules`** — depends on `vendors` (nullable FK) + `currencies`. Seed exactly one platform-wide default row before any order can be placed.
6. **`coupons`** — depends on `vendors` (nullable FK) + `currencies`.
7. **`orders`** — depends on `contacts`, `vendors`, `vendor_services`, `commission_rules`, `coupons`, `currencies` — the widest-dependency table in this product, lands last among the schema tables.
8. **`payments`** — depends on `orders` + `payment_methods`.
9. **`vendor_payment_accounts`** — depends on `vendors` + `currencies`.
10. **`payouts`** — depends on `vendors` + `orders`.
11. `user_roles` CHECK constraint update (`'vendor'` + `'customer'`) — already shipped ahead of this plan as migration `0024_vendor_role_rename.py`, not a new task here.
12. Backend endpoints, public directory pages, vendor dashboard pages, staff-side additions, RLS tests + verification.

## 2. Migrations (Alembic revisions — additive, per constitution #7)

- **`00XX_vendor_domain.py`** — `vendors` (with location + SEO fields), `vendor_media`, `vendor_tags`, `vendor_subscriptions`, `proposal_vendors` + RLS (public SELECT where active+subscribed, staff ALL, vendor SELECT/UPDATE own — cannot self-activate). This is the §6 design, previously called "suppliers," now built under the renamed vocabulary from day one — no separate rename migration needed for these tables since they've never been merged.
- **`00XX_vendor_services.py`** — table + RLS (public SELECT via active vendor, staff ALL, vendor ALL own).
- **`00XX_payment_methods.py`** — table + seed (`stripe`) + RLS (public SELECT, staff ALL).
- **`00XX_commission_rules.py`** — table + seed (one platform-wide default row — **rate must be confirmed before this migration merges**, flagged in §7 below) + RLS (staff ALL, vendor SELECT own override + the default row only).
- **`00XX_coupons.py`** — table + RLS (staff ALL, vendor SELECT/INSERT own vendor-scoped rows, NO anon SELECT — validated via RPC only).
- **`00XX_orders.py`** — table + RLS (staff ALL, vendor SELECT own via `supplier_id`, anon INSERT via edge function only — mirrors the `enquiries` anonymous-intake pattern).
- **`00XX_payments.py`** — table + RLS (staff ALL, vendor SELECT own via order→`supplier_id` join, no direct anon access — webhook/edge-function-maintained, same trust model as `vendor_subscriptions`).
- **`00XX_vendor_payment_accounts.py`** — table + RLS (staff ALL, vendor SELECT/UPDATE own) — same masked-display treatment as `landlord_payment_accounts`.
- **`00XX_payouts.py`** — table + RLS (staff ALL, vendor SELECT own).

Each revision ships its RLS in the same migration, per constitution #7.

## 3. Backend (API)

- `POST /vendors` — vendor application/self-listing, lands `status='pending_approval'`.
- `POST /vendors/{id}/approve` — staff only.
- `GET /vendors` (public) — directory browse/filter by category, district/city, distance (if lat/long populated), price range.
- `GET /vendors/{slug}` (public) — full profile including `vendor_services`.
- `POST /vendors/{id}/services` — vendor manages their own service list.
- `POST /vendors/{id}/commission-override` (staff) — sets a vendor-specific `commission_rules` row; vendor can *request* one but not set it themselves (mirrors Product 3's pricing-request pattern — worth confirming at `/tasks` time whether this needs its own request/approve table like `pricing_rule_change_requests`, or a simpler staff-direct-edit is acceptable given commission is platform economics, not vendor-facing pricing).
- `POST /orders` — public, guest-friendly, creates a `contacts` row if needed (same dedup-by-email non-unique pattern as enquiry intake), applies a coupon if provided (via the coupon-validation RPC), computes `commission_amount`/`payout_amount` from the active `commission_rules` lookup.
- `POST /orders/{id}/payment` — Stripe payment intent creation + webhook handler for `payments.status` updates.
- `GET /vendor/orders` — vendor's own order list + quote-request responses.
- `GET/PUT /vendor/payment-account` — payout method + details, masked on read.
- `POST /coupons` — vendor-scoped (own vendor_id only) or staff (platform-wide, `supplier_id` null).
- `POST /payouts` — staff triggers/records a manual payout, or a Stripe Connect webhook records an automatic one.

## 4. Frontend

Per PRD §10 page inventory: public `/vendors` directory + `/vendors/[slug]` profile (SEO-critical, server-rendered), `/vendor/*` dashboard (login, orders, payouts, coupons), a checkout flow on the vendor profile page (guest-first, optional account creation), and an optional `/account/orders` for customers who did create an account.

Staff-side: vendor approval queue, commission-override review, platform-wide coupon management — additions to existing `/app/*`, no new staff route.

## 5. Verification plan (maps to `verification.md`, written next)

- Cross-tenant denial: vendor A cannot see vendor B's orders, payment account, services-in-draft, or commission override.
- Guest order (no `customer_user_id`) is only visible to staff and the owning vendor — never to another guest or account holder.
- An order can be created and persist correctly with zero linked `payments` rows (the pay-later/quote path is a first-class state, not an edge case that breaks anything downstream).
- Coupon discount reduces `total_amount` correctly; `commission_amount` is calculated against the post-discount amount, verified with a concrete numeric test case.
- A vendor-specific commission override is used over the platform default when one exists; changing the platform default afterward does not alter a previously completed order's `commission_amount` (reproducibility test, same discipline as `pricing_rules`' F3).
- `payout_method` can differ per vendor and the correct account fields are required/validated per method.
- anon has zero direct SELECT on `coupons` or `commission_rules` under any circumstance (same hard-line test pattern as `pricing_rules`).

## 6. Explicitly not in this plan

AI-assisted SEO copy, vendor analytics/dashboards, ratings/reviews, live exchange rates, multi-vendor cart/checkout — all per PRD §8, unchanged.

## 7. Open items before `/tasks`

- **Platform-wide default commission rate** — needs an actual number (percentage + fixed fee) before the seed migration can merge. Currently undecided.
- **Migration sequencing against Product 3** — both products are building alongside each other and Product 4 depends on Product 3's `currencies` table; needs an explicit merge order decided at `/tasks` time, not assumed.
- **Commission override mechanism** — confirm whether it needs its own request/approve workflow (like Product 3's `pricing_rule_change_requests`) or a simpler direct staff edit is acceptable, since commission is platform economics rather than vendor-facing pricing the vendor is being asked to trust.
- **Geocoding provider** for `vendors.latitude/longitude` — needed before location-based search actually works, not before the columns exist.
