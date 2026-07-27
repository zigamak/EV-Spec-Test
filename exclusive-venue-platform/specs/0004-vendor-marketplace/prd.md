# PRD — Product 4: Vendor Marketplace

*Authored directly, decided in-session 2026-07-27 (see product-brief.md for how this deviates from the "paste the Notion PRD" pipeline — no Notion source exists for this product). Status: Draft · Build window: Week 6 onward, alongside Product 3.*

## 1. Overview & Problem Statement

See `product-brief.md` §1. In short: `vendors` (renamed from `suppliers`) already exists as a schema concept (`erd.md` §6) but only as a proposal-embedded reference; this build adds a detailed public directory, self-service listing management, and — by explicit decision, overriding the general Phase-2 bookings/payments deferral for this piece specifically — a real client-to-vendor transaction engine with commission and payout (`erd.md` §6b).

## 2. Goals & Success Metric

See `product-brief.md` §2.

## 3. Users

See `product-brief.md` §3.

## 4. Core User Flow

**Vendor onboarding:**
1. Staff invites a vendor (or a vendor applies and lands as `status='pending_approval'`, mirroring the venue/landlord approval mechanic) — staff approval required before the listing is public. Cannot self-activate.
2. Vendor builds their profile: business details, category, location (address/district/city/region, geocoded lat/long, service area radius), SEO fields (meta title/description), media.
3. Vendor lists services via `vendor_services` — structured price (flat/per-head/per-hour) by default, or flagged `pricing_type='quote'` for services where a fixed price doesn't make sense.
4. Vendor sets up payout: `vendor_payment_accounts`, choosing `payout_method` = manual (bank details, staff-verified) or Stripe Connect (where viable for their country).

**Client ordering (public marketplace):**
5. A client browses the public directory — filter by category, location/distance, price range — and opens a vendor's profile.
6. For a structured-price service: client orders directly. For a quote-only service: client submits a request; the vendor responds with pricing off the fixed-price rail (still recorded as an order with `supplier_service_id` null, `subtotal_amount` set once agreed).
7. An optional coupon code is applied at checkout (validated via RPC, never a raw table read) — platform-wide or vendor-specific.
8. **Order can be placed without payment** (explicitly requested) — it sits at `status='pending'` until a payment is made or staff/vendor confirms an offline arrangement. Guest checkout is the default; a client can optionally create a `customer` account to track order history, but it's never required.
9. When payment does happen, it goes through Stripe (`payment_methods` — extensible, Stripe-only today) and is recorded against the order; `commission_amount`/`payout_amount` are computed at order time from the active `commission_rules` ruleset (platform default, or the vendor's own override if one exists) and pinned so a later rate change never alters this order's math.
10. Once the order is fulfilled, staff (or an automated Stripe Connect split, if that's the vendor's payout method) executes the payout — recorded in `payouts`.

**Staff oversight (existing `/app/*`, additions not a new surface):**
11. Staff approves pending vendor listings and reviews any commission-rate override requests.
12. Staff manages platform-wide coupons (vendor-specific coupons are self-service on the vendor's own dashboard).
13. Staff has visibility into all orders/payments/payouts across every vendor — same "staff sees everything" principle already established for venues/landlords in Product 3.

## 5. Functional Requirements

**Vendor profile — detailed for discovery**
Beyond the existing category/description/media: full location fields (address, district, city, region, latitude/longitude, service area radius) so the public directory can support location/distance-based search, and SEO fields (meta_title, meta_description) so individual vendor pages are actually indexable and findable — this is explicitly "as detailed as possible... every detail a platform would need to grow," not a minimal listing.

**Structured pricing, with a quote escape hatch**
`vendor_services`: name, description, `pricing_type` CHECK IN ('flat','per_head','per_hour','quote'), amount (required unless quote), currency (via the shared `currencies` table from Product 3 — not redefined here). Most services show a real price a client can order against directly; a vendor can flag any specific service as quote-only when a fixed price genuinely doesn't fit (e.g. a fully bespoke installation).

**Commission — platform default + per-vendor override, both required**
`commission_rules`: exactly one active platform-wide default row (`supplier_id` null) at all times, plus optional vendor-specific override rows. Rate = **percentage + fixed fee**, matching the combined-fee structure explicitly requested (e.g. Stripe's own model: X% + a flat amount). Versioned by `effective_from`/`effective_to`, identical reproducibility discipline to `pricing_rules` — a commission change never alters an order already priced against the prior ruleset.

**Payout — manual or Stripe Connect, a per-vendor setting**
`vendor_payment_accounts.payout_method` CHECK IN ('manual','stripe_connect') — explicitly a setting each vendor chooses, not a single build-wide mechanism, because Stripe Connect Express isn't self-serve everywhere (Thailand-based accounts require Stripe sales engagement, per the Product 3 research). A vendor in a country where Connect works can use automatic splits; one where it doesn't falls back to manual, same bank-details-on-file pattern as `landlord_payment_accounts`.

**Coupons — platform-wide and vendor-created**
`coupons.supplier_id` nullable: null = a platform-wide code staff creates, set = a vendor's own promo code for their own listings only. Percentage or flat discount; flat requires a currency. Applied against `orders.subtotal_amount` to produce `discount_amount`, and commission is calculated on the resulting post-discount `total_amount` — so a discount reduces both what the client pays and what EV earns commission on, not just what the vendor nets. Never directly browsable by anon — validated/applied via RPC only, same "engine output, not raw rules" treatment as `pricing_rules`.

**Ordering — guest by default, account optional, payment optional**
`orders.contact_id` NOT NULL (always present, guest or not, same anonymous-friendly shape as `enquiries`), `customer_user_id` nullable (set only if the orderer has/creates a `'customer'`-role account). An order can exist at `status='pending'` with zero linked `payments` rows — explicitly required, covers quote requests and pay-later arrangements. Named `orders`, not `bookings`, to stay distinct from venue-side booking/hold vocabulary.

**Payment methods — extensible, Stripe only today**
`payment_methods` reference table (code/name/enabled) so `payments.payment_method` is never a hardcoded string — adding a second method later (e.g. a local payment rail) is additive, not a schema change, mirroring the `currencies` "reference table now, extend later" pattern.

## 6. The AI-vs-Deterministic Boundary (Product 4 specifics)

No AI involvement in pricing, commission, or payout — all deterministic, structured data, same trust boundary the constitution already establishes for venue pricing. The one place AI *could* plausibly help (drafting SEO meta descriptions from a vendor's profile text, similar to how proposal copy is AI-drafted-but-editable) is not required for v1 — vendors write their own SEO fields directly; an AI-assist pass is a cheap future enhancement, not a blocker.

## 7. Acceptance Criteria

- A vendor can build a complete public profile (location, structured services, media, SEO fields) and it appears in the public directory once staff approves it — not before.
- A client can browse/filter vendors by category and location, and see real prices for structured (non-quote) services.
- A client can place an order (as a guest, no account) that results in zero linked payment rows if no payment is made — verified as a real, valid state, not an error case.
- A client can optionally create a `customer` account and see their own order history; a guest order is never visible to anyone but staff/the vendor.
- Applying a valid coupon reduces `total_amount` correctly, and `commission_amount` is calculated on the post-discount amount, not the pre-discount subtotal.
- A vendor-specific commission override, once set, is used instead of the platform default for that vendor's orders — and an existing completed order's `commission_amount` is provably unaffected by a later rate change (F3-style reproducibility test, mirroring `pricing_rules`).
- A vendor can choose `payout_method='manual'` or `'stripe_connect'` independently of any other vendor's choice, and the correct fields (bank details vs. Stripe Connect account id) are populated/validated accordingly.
- Cross-tenant denial: vendor A cannot see vendor B's orders, payment account, or commission override (same RLS discipline as the landlord cross-tenant tests in Product 3).

## 8. Out of Scope (Deferred)

- AI-assisted SEO copy drafting for vendor profiles — cheap future enhancement, not v1.
- Vendor revenue analytics/dashboards beyond raw order/payout records — aggregation/reporting layer, same Phase-2 category as Product 1's deferred pipeline dashboards.
- Ratings/reviews on vendor profiles — not requested, would be a real new feature (moderation, abuse handling), not assumed.
- Live currency exchange rates — `currencies` table exists (from Product 3), rate-fetching does not, until a real conversion need exists.
- Multi-order carts / booking multiple vendors in one checkout — each order is one vendor's service; a "curate several vendors for one event" flow is closer to how `proposal_vendors` already works inside Product 1/2 proposals, not a marketplace-checkout concern.

## 9. Dependencies

- **`currencies` table** (Product 3, `erd.md` §6a) — `vendor_services.currency`, `commission_rules.currency`, `orders.currency`, `coupons.currency` all reference it. Product 4's migrations must land after Product 3's `currencies` migration, or bring their own copy of it forward — sequencing decision needed at `/tasks` time.
- **Stripe account** (platform-level, for both `payment_methods='stripe'` client charges and any `stripe_connect` vendor payouts) — same dependency category as `vendor_subscriptions`' existing Stripe integration.
- Vendor geocoding (address → lat/long) — needs a decision on which geocoding service/provider before the location-search feature can actually work; storing the columns doesn't require this yet, but populating them does.

## 10. Page Inventory

| Page | Route | Features | Notes |
|---|---|---|---|
| Public Vendor Directory | `/vendors` (or `/marketplace`) | Browse/filter by category, location, price | Public, unauthenticated, SEO-indexable |
| Vendor Profile (public) | `/vendors/[slug]` | Full profile: location, services, pricing, media | Public, unauthenticated, SEO-indexable per vendor |
| Vendor Login | `/vendor/login` | Auth | Same pattern as `/landlord/login` |
| Vendor Dashboard | `/vendor` | Own profile, services, orders, payout settings | Role-gated `has_role('vendor')` |
| Vendor Orders | `/vendor/orders` | List/manage own orders, respond to quote requests | Own-row RLS via `supplier_id` |
| Vendor Payouts | `/vendor/payouts` | Payout method setting (manual/Stripe Connect), account details | Mirrors `/landlord/payouts` |
| Vendor Coupons | `/vendor/coupons` | Create/manage own vendor-scoped coupons | Cannot see or edit platform-wide coupons |
| Checkout | modal/flow on vendor profile | Order a structured service or submit a quote request, optional coupon | Guest by default; optional `customer` signup |
| Customer Account (optional) | `/account/orders` | Order history, for orderers who created a `customer` account | Not required to order |

**Staff-side additions (existing `/app/*`, not new routes):** vendor listing approval queue, commission-override review, platform-wide coupon management, cross-vendor order/payout visibility.
