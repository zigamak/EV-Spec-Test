# Tasks — Product 4: Vendor Marketplace

*Decomposed from `plan.md`, same atomic-task convention as Products 1/3. No Notion Sprint Board rows exist yet for this product — sync into the Sprint Board per CLAUDE.md's weekly ritual once hours are assigned.*

# Legend: [deps] = must be complete first. One task ≈ one focused agent session.

## A. Vendor Domain (base marketplace schema)
- [x] A1. **Alembic revision `0030_vendor_domain.py`:** `vendors` (with
      location + SEO fields), `vendor_media`, `vendor_tags`,
      `vendor_subscriptions`, `proposal_vendors` + RLS. Built fresh under
      "vendor" vocabulary — no rename debt, these tables were never
      migrated under "supplier".  [deps: none]
      — Written, ruff-clean. Not yet applied live.
- [x] A2. `app/routers/vendors.py`: full CRUD + `/approve` (mirrors
      `venues.py` exactly, including "no vendor self-activate" via RLS's
      WITH CHECK) + a public `/vendors/directory` endpoint (category/
      district filter, admin-client read for active+subscribed vendors
      only).  [A1]

## B. Vendor Services (structured pricing + quote escape hatch)
- [x] B1. **Alembic revision `0031_vendor_services.py`:** table + RLS.
      Depends on `currencies` (Product 3's `0025`).  [A1]
- [x] B2. `app/routers/vendors.py` (services sub-routes): CRUD +
      `/services/public` for the vendor's own marketplace page.  [B1]

## C. Payment Methods (reference data)
- [x] C1. **Alembic revision `0032_payment_methods.py`:** table + seed
      (`stripe`) + RLS.  [deps: none]
- [x] C2. `app/routers/payment_methods.py`: `GET /payment-methods`.  [C1]

## D. Commission Rules
- [x] D1. **Alembic revision `0033_commission_rules.py`:** table +
      partial-unique-index (exactly one active platform default at a
      time) + RLS + seed. **Placeholder rate seeded (15% + 0 fixed fee)
      — not a confirmed business number**, flagged explicitly in the
      migration's own docstring; correcting it is a data change, not a
      schema change.  [A1]
- [x] D2. `app/services/commission_engine.py`: `find_active_commission_rule`
      (lookup, needs a DB client) + `calculate_commission` (pure,
      unit-tested — `tests/test_commission_engine.py`, 4/4 passing real
      runs).  [D1]
- [x] D3. `app/routers/commission_rules.py`: staff-only create (direct
      edit, not a propose/approve workflow — resolved the open question
      from `plan.md` §7 in favor of the simpler path, since commission is
      platform economics, not vendor-facing pricing) + RLS-scoped list
      (vendor sees own override + the default, never another vendor's
      rate).  [D2]

## E. Coupons
- [x] E1. **Alembic revision `0034_coupons.py`:** table + RLS (no anon
      SELECT at all — same hard line as `pricing_rules`) + a same-table
      CHECK capping `discount_value <= 100` when `discount_type='percentage'`
      (added during build, not in the original plan — a defensive
      DB-level backstop alongside the engine's own cap).  [A1]
- [x] E2. `app/services/coupon_engine.py`: `calculate_discount` (pure,
      unit-tested — `tests/test_coupon_engine.py`, 4/4 passing) +
      `validate_and_apply_coupon` (the "RPC" `erd.md` §6b describes —
      status/date-range/max-uses/min-order checks, never a raw table
      read).  [E1]
- [x] E3. `app/routers/coupons.py`: vendor create/list own scoped coupons,
      staff create platform-wide ones, `POST /coupons/validate` (the only
      way anyone — including a guest — checks a code).  [E2]

## F. Orders (the widest-dependency table)
- [x] F1. **Alembic revision `0035_orders.py`:** table + RLS (no anon
      policy at all — public creation is a service-role/admin-client call
      from the API layer, same pattern as `enquiries`/`public_proposals.py`,
      not a direct anon PostgREST insert). Depends on `contacts`, `vendors`,
      `vendor_services`, `commission_rules`, `coupons`, `currencies`.  [A1,
      B1, D1, E1]
- [x] F2. **Alembic revision `0039_contacts_marketplace_source.py`:** adds
      `'marketplace'` to `contacts.source` — reusing `'web_form'` would
      have misrepresented the real channel for reporting.  [deps: none]
- [x] F3. `app/routers/orders.py`: `POST /orders` (guest checkout — finds-
      or-creates a contact, prices off the vendor service or leaves
      `subtotal_amount=0` for a quote request, applies a coupon, prices
      commission off the active ruleset), `GET /orders` (RLS-scoped: staff/
      vendor/customer), `PATCH /orders/{id}/quote` (vendor prices a quote
      request, recomputes totals server-side — never trusts a client-
      supplied total), `PATCH /orders/{id}/status`.  [F1, F2, D2, E2]

## G. Payments
- [x] G1. **Alembic revision `0036_payments.py`:** table + RLS (no anon
      access — webhook/service-role-maintained).  [F1]
- [x] G2. `app/routers/payments.py`: `POST /payments` (creates a Stripe
      PaymentIntent, lazy SDK import matching `llm.py`'s pattern),
      `POST /payments/webhook` (Stripe's own signature scheme, fails
      closed if unconfigured — mirrors the Resend webhook's Svix
      verification), `GET /payments/{order_id}`. Added `stripe==11.4.1` to
      `requirements.txt` and `stripe_secret_key`/`stripe_webhook_secret`
      to `config.py`.  [G1]
      — **Untested against a live Stripe account** — no keys configured in
      this environment, same caveat as every other external-service
      integration in this codebase.

## H. Vendor Payouts
- [x] H1. **Alembic revision `0037_vendor_payment_accounts.py`:** table +
      RLS. `payout_method` is a per-vendor setting (manual or
      stripe_connect), not a build-time choice.  [A1]
- [x] H2. `app/routers/vendor_payment_accounts.py`: `GET/PUT` own record +
      staff masked view — structurally identical to `landlord_payment_
      accounts.py`, reuses its `mask_account_number` helper.  [H1]
- [x] H3. **Alembic revision `0038_payouts.py`:** table + RLS.  [F1, H1]
- [x] H4. `app/routers/payouts.py`: staff-only create (computed from the
      order's stored totals, not recalculated) + mark-paid.  [H3]

## I. Frontend (NOT STARTED)
- [ ] I1. Public vendor directory (`/vendors`) — browse/filter by
      category/location/price. SEO-critical, should be server-rendered,
      not the client-fetched pattern the rest of this app uses.  [A2]
- [ ] I2. Public vendor profile (`/vendors/[slug]`) — full profile,
      services, media.  [A2, B2]
- [ ] I3. Vendor dashboard (`/vendor/*`): login, own profile/services
      management, orders list, payouts, coupons. Mirrors the `/landlord/*`
      pattern from Product 3 closely enough that those pages are the
      right starting point to adapt, not a from-scratch design.  [A2, B2,
      F3, H2, E3]
- [ ] I4. Checkout flow on the vendor profile page — guest-first, optional
      account creation, coupon field, Stripe Elements/Checkout integration
      for the actual card entry (not built at all yet — G2's PaymentIntent
      creation exists, nothing calls it from the frontend).  [F3, G2]
- [ ] I5. Staff-side additions to `/app/*`: vendor approval queue,
      commission-override review, platform-wide coupon management,
      cross-vendor order/payout visibility. None of this exists yet.  [A2,
      D3, E3, F3]
- [ ] I6. Optional customer account pages (`/account/orders`) for orderers
      who create a `'customer'`-role account.  [F3]

## J. Verification
- [x] J1. Real unit tests for the two genuinely pure functions added this
      product: `calculate_commission` (4/4) and `calculate_discount`
      (4/4). Full suite re-run: 76 passed, 1 pre-existing skip, 0
      regressions.
- [ ] J2. Cross-tenant denial tests (vendor A cannot see vendor B's
      orders/payment account/services/commission override), guest-order
      visibility, discount-then-commission calculation against a concrete
      numeric case end-to-end, `payout_method` differing per vendor —
      all the scenarios plan.md §5 lists. **Same blocker as Product 3's
      F1-F4**: no local Postgres/Docker or live Supabase credentials in
      this environment. Not mocked, for the same reason Product 3's
      weren't — a mocked table-CRUD test wouldn't exercise a real RLS
      policy.
- [ ] J3. `/verify` vs `verification.md` acceptance criteria; log verdict.
      Blocked on J2 and on I1-I6 (frontend) existing at all.

---

**What's built vs. what's left, in one line:** the entire backend (A-H) is
written, ruff-clean, and has every pure-function piece unit-tested — but
none of it has run against a live database, and the ENTIRE frontend (I)
is unbuilt. This is a much earlier stopping point than Product 3, which
has both backend and frontend done. Product 4's frontend is a genuinely
large remaining unit of work, not a quick follow-up.
