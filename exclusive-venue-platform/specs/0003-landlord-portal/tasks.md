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
- [x] B3. "Invite landlord" action on the existing staff Venue edit page
      (`web/app/app/venues/[id]/edit/page.tsx`, `components/
      LandlordInvitePanel.tsx`) — email input, calls B2. **Partial:** sends
      the invite; does not yet auto-link it to this specific venue on
      acceptance (Path A's "assign an existing/newly-accepted landlord to
      this venue" step is a small follow-up — the invite exists and works,
      the venue-assignment convenience wiring on top of it doesn't yet).
      [B2]

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
- [x] C3. UI: `/landlord/payouts` — self-service bank detail entry form
      (`web/app/landlord/payouts/page.tsx`), currency dropdown sourced from
      `GET /currencies`.  [C2, E-group login/middleware]
      — Not run through `tsc`/`npm run typecheck` — no `node_modules`
      installed in this environment. Manually checked against the API
      contract (route paths, field names) instead.

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
- [x] D4. UI: Pricing tab on `/landlord/venues/[id]` — view live `pricing_rules`
      (read-only), submit a pending request (base rate/currency/effective
      date only — the full jsonb tier/multiplier editor a landlord could use
      is a follow-up, matching how much of `PricingRulesTab.tsx`'s
      complexity is actually needed for a first proposal).  [D2]
      — Same typecheck caveat as C3.
- [x] D5. UI: pricing-request review queue added to the existing staff
      `/app/venues/[id]/edit` page (`components/PricingRequestsReviewPanel.tsx`,
      new section below the existing Pricing rules tab) — approve/reject
      action.  [D3]
      — Same typecheck caveat as C3.

## E. Landlord Portal Core (auth + venue self-management)
- [x] E1. `/landlord/login` (`web/app/landlord/login/page.tsx`) + middleware
      role gate (`web/middleware.ts`, `has_role('landlord')`, redirect not
      403 on mismatch). `lib/api/client.ts`'s `redirectToLogin` made
      surface-aware (a `/landlord/*` 401 bounces to `/landlord/login`, not
      `/app/login`).  [deps: none — auth infra already exists from
      Product 1's A2]
- [x] E2. `/landlord` — My Venues: flat list via `GET /venues` (RLS
      auto-scopes to `landlord_id = auth.uid()`), status badges, "Add venue"
      inline form (Path B — sets `landlord_id`/`status='pending_approval'`
      client-side, RLS's `venues_landlord_insert_own` is the real
      enforcement).  [E1]
- [x] E3. `/landlord/venues/[id]` — edit description/address/district, view
      configurations + restrictions, embeds the D4 pricing tab. Reuses
      Product 1's existing venue CRUD endpoints end-to-end (`venues.py`) —
      RLS already scopes these correctly, no new API surface. **Partial:**
      media gallery upload and the availability calendar are NOT built on
      this page yet — deliberately deferred (noted, not silently skipped)
      as the lower-value remainder of this task; configurations/
      restrictions are read-only lists here (add/edit reuses the same
      endpoints but no UI for it yet either).  [E2]
      — Same typecheck caveat as C3/D4/D5.

## F. Verification
- [x] F0. `api/tests/test_landlord_payment_account.py` — real, run unit tests
      (5 passed) for `mask_account_number`, the one genuinely pure function
      added this product. Full suite re-run to confirm no regressions:
      68 passed, 1 skipped (golden briefs, no API key — pre-existing,
      unrelated), ruff clean.
- [ ] F1. Cross-tenant denial tests: landlord A cannot see landlord B's venues,
      payment account, or pricing requests (extends the existing RLS test
      pattern from Product 1's test-security checklist).  [C1, D1, E3]
      — **Cannot be executed in this environment**: no local Postgres/Docker
      available, and no live Supabase credentials either. A mocked
      table-CRUD test wouldn't actually exercise the RLS policy and would
      give false confidence, so this is left genuinely pending rather than
      faked — same "live-verified" convention every prior RLS test in this
      repo (B1, C1, F1 in Product 1) already follows.
- [ ] F2. Policy-level test: a landlord cannot set
      `pricing_rule_change_requests.status` to `'approved'` directly — not
      just an API-layer check, the RLS policy itself must reject it.  [D1]
      — Same live-Postgres blocker as F1.
- [ ] F3. F3-regression test: approving a pricing request produces a new
      `pricing_rules` row with correct `effective_from`, and any
      `proposal_venues` row already quoted against the prior version still
      resolves the same total.  [D3]
      — Same live-Postgres blocker as F1.
- [ ] F4. Invite → accept → venue assignment round-trip (Path A) and invite →
      accept → self-add venue (Path B), both verified end-to-end.  [B3, E2]
      — Same live-Postgres blocker as F1; also needs a real Supabase Auth
      invite to actually land (B2's live-untested caveat).
- [ ] F5. `/verify` vs `verification.md` acceptance criteria; log verdict.  [all]
      — Blocked on F1-F4, which are blocked on live infrastructure access.

**What it would take to unblock F1-F4:** `SUPABASE_DB_URL` pointed at either
a real Supabase project or a local Postgres with the CI workflow's
auth-schema stub (`.github/workflows/ci.yml`'s bootstrap step), then
`alembic upgrade head` (revisions 0025-0028) followed by creating two test
landlord accounts and running through each scenario above by hand or via a
pytest suite using `psycopg` directly against that instance — not
mocked. This is infrastructure access this environment doesn't have, not
a missing design decision.

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
