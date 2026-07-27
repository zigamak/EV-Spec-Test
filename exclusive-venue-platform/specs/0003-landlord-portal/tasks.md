# Tasks — Product 3: Landlord Portal

*Decomposed from `plan.md` (which references `specs/0000-foundation/erd.md` §6a/§7) into atomic, few-file units, same convention as `specs/0001-product-1-core/tasks.md`. Build window: Week 6 onward, after Product 1/2. No Notion Sprint Board rows exist yet for this product — this file is the initial decomposition; sync into the Sprint Board per CLAUDE.md's weekly ritual once hours are assigned.*

# Legend: [deps] = must be complete first. One task ≈ one focused agent session.

## A. Shared Foundation
- [x] A1. **Alembic revision `0025_currencies.py`:** `currencies` table (code PK,
      symbol, name) + RLS (public SELECT, staff ALL) + seed data (HKD, THB,
      USD — confirmed in-session). Then: **ALTER** `pricing_rules.currency`
      from free-text default to FK against `currencies.code` (no real backfill
      needed — every existing row already holds 'HKD', which is seeded first).
      [deps: none — first table this product needs]
      — Written, ruff-clean, syntax-verified. **Not yet applied to any live
      database** — no Supabase credentials in this environment, same caveat
      as every unmigrated revision in this repo (0007, 0008, etc.).
- [x] A2. `GET /currencies` — public, unauthenticated (`app/routers/currencies.py`,
      admin-client read, same pattern as `public_proposals.py` for trivial
      public reads). Wired into `main.py`.  [A1]
      — **Not verified against a live API process** — no `fastapi` package
      installed in this environment's Python interpreter (only `ruff` and a
      syntax check were available here); needs a real run once dependencies
      are installed.

## B. Landlord Invite
- [x] B1. **Alembic revision `0026_landlord_invites.py`:** `landlord_invites`
      table + RLS (staff ALL only — an internal tracking artifact, never
      exposed to the invitee directly).  [deps: 0001 profiles/user_roles —
      already merged]
      — Written, ruff-clean, syntax-verified. Not yet applied live (same
      caveat as A1).
- [x] B2. `POST /landlord-invites` + `GET /landlord-invites` —
      `app/routers/landlord_invites.py`. Calls Supabase Auth's admin
      `invite_user_by_email` server-side (service-role key never reaches the
      client), writes a `landlord_invites` row. **Real security note:** this
      is the one endpoint in the product that can't rely on RLS for role
      enforcement (inviting a user is an Auth Admin API call, not a table
      INSERT) — added an explicit in-code `has_role` check
      (`_require_staff_or_admin`) that's genuinely load-bearing, not
      redundant. Wired into `main.py`.  [B1]
      — **The actual Supabase Auth admin call is untested live** — no
      Supabase credentials in this environment, and the `gotrue`/`supabase`
      packages aren't installed in the Python interpreter available here
      either, so not even a local unit test could exercise it this session.
      Written against the documented public `invite_user_by_email` API;
      needs a real run to confirm. Branded email template (Supabase's
      customizable Invite User template) is still a separate content/design
      task, not done here.
- [ ] B3. "Invite landlord" action on the existing staff Venue Profile
      (`/app/venues/[id]`) — email input, calls B2, optionally links the
      invite to this specific venue (Path A in `prd.md` §4) so `landlord_id`
      gets set automatically once accepted.  [B2]

## C. Landlord Payment Account (manual only — Stripe Connect explicitly deferred)
- [x] C1. **Alembic revision `0027_landlord_payment_accounts.py`:**
      `landlord_payment_accounts` table (FK to `currencies`) + RLS
      (`landlord_payment_accounts_landlord_own` — FOR ALL, so a landlord can
      insert/select/update/delete only their own row; staff ALL).  [A1]
      — Written, ruff-clean. Not yet applied live (same caveat as A1).
- [x] C2. `GET/PUT /landlord/payment-account` (own record, no masking needed
      — RLS guarantees it's always the caller's own) + `GET
      /landlord/payment-account/{landlord_id}` (staff view, masked to
      last-4 via `mask_account_number()` — a value transform RLS can't
      express, done in the router). `app/routers/landlord_payment_accounts.py`.
      [C1]
      — Not verified against a live API process (no `fastapi` installed in
      this environment's interpreter — see A2's same caveat).
- [ ] C3. UI: `/landlord/payouts` — self-service bank detail entry form.  [C2, E-group login/middleware]

## D. Pricing: Propose, Don't Write
- [x] D1. **Alembic revision `0028_pricing_rule_change_requests.py`:** table +
      RLS: landlord SELECT/INSERT own venue's requests (ownership traced via
      `venues.landlord_id`, same join pattern as `pricing_rules_landlord_select_own`
      in `0005`), staff ALL including the `status` transition. **No landlord
      UPDATE policy exists at all** — not just app-layer trust, the DB itself
      has no path for a landlord to touch `status`. INSERT policy also forces
      `status='pending'` and `proposed_by=auth.uid()` at the `WITH CHECK` level.
      [A1, deps on existing `pricing_rules`/`venues` from `0002`/`0005`]
      — Written, ruff-clean. Not yet applied live.
- [x] D2. `POST /venues/{id}/pricing-requests` — landlord submits a proposed
      ruleset (payload reuses `PricingRuleCreate`'s shape directly). Also
      `GET /venues/{id}/pricing-requests` (RLS auto-scopes: landlord sees own,
      staff sees all).  [D1]
- [x] D3. `POST /venues/{id}/pricing-requests/{request_id}/approve|reject` —
      staff-gated in code too (approval performs a second write a landlord
      must never trigger even indirectly). Approve creates a **new, versioned**
      `pricing_rules` row from the request's stored payload (never mutates an
      existing one — F3 reproducibility from Product 1 stays intact) and
      stamps `reviewed_by`/`reviewed_at`/`pricing_rules_id`. 409 if the
      request was already reviewed (no double-approve).
      `app/routers/pricing_rule_change_requests.py`.  [D2]
      — Not verified against a live API process (same environment caveat as
      A2/C2).
- [ ] D4. UI: Pricing tab on `/landlord/venues/[id]` — view live `pricing_rules`
      (read-only), submit/edit a pending request.  [D2]
- [ ] D5. UI: pricing-request review queue/tab added to the existing staff
      `/app/venues/[id]` — approve/reject action.  [D3]

## E. Landlord Portal Core (auth + venue self-management)
- [ ] E1. `/landlord/login` + middleware role gate (`has_role('landlord')`,
      redirect not 403 on mismatch — matches the existing `/app/*` pattern in
      `route-architecture.md`).  [deps: none — auth infra already exists from
      Product 1's A2]
- [ ] E2. `/landlord` — My Venues: flat list where `landlord_id = auth.uid()`,
      status badges, "Add venue" entry point (Path B — `venues_landlord_insert_own`
      policy already exists, no new backend logic, just wiring the existing
      `POST /venues` endpoint to a landlord-authenticated caller).  [E1]
- [ ] E3. `/landlord/venues/[id]` — edit description, address, district,
      amenities, media, configurations, availability, restrictions. Reuses
      Product 1's existing venue CRUD endpoints end-to-end (`venues.py`,
      `venue_media.py`) — RLS already scopes these correctly to
      `landlord_id = auth.uid()`, no new API surface.  [E2]

## F. Verification
- [ ] F1. Cross-tenant denial tests: landlord A cannot see landlord B's venues,
      payment account, or pricing requests (extends the existing RLS test
      pattern from Product 1's test-security checklist).  [C1, D1, E3]
- [ ] F2. Policy-level test: a landlord cannot set
      `pricing_rule_change_requests.status` to `'approved'` directly — not
      just an API-layer check, the RLS policy itself must reject it.  [D1]
- [ ] F3. F3-regression test: approving a pricing request produces a new
      `pricing_rules` row with correct `effective_from`, and any
      `proposal_venues` row already quoted against the prior version still
      resolves the same total.  [D3]
- [ ] F4. Invite → accept → venue assignment round-trip (Path A) and invite →
      accept → self-add venue (Path B), both verified end-to-end.  [B3, E2]
- [ ] F5. `/verify` vs `verification.md` acceptance criteria; log verdict.  [all]

---

**Migration order note:** A1 (`currencies`) must land before C1 and D1's
dependents that reference it — see `plan.md` §1 for the full dependency
chain. B-group (invites) has no dependency on A1 and can be built in parallel.

**Not in this file (per CLAUDE.md's filter rule):** anything from Sprint
Board rows that isn't engineering — e.g. deciding the actual currency seed
list is a human decision task, not an agent task; A1 is blocked on that
decision, not on any code.

## Out-of-scope pages (explicit — see `prd.md` §8)

- **No Stripe Connect integration in this build** — manual payout only;
  `landlord_payment_accounts` is designed so a `stripe_connect_account_id`
  column + webhook handler can be added later without restructuring it.
- **No landlord self-registration page** — invite-only, no exceptions.
- **No landlord revenue dashboard** — Phase 2, per `erd.md` §9.
