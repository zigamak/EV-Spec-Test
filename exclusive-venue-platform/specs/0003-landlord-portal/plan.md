# Plan — Product 3: Landlord Portal

*Generated from `prd.md` + `specs/0000-foundation/erd.md` §6a/§7 (schema of record). Per CLAUDE.md, this is reviewed output, not hand-written from scratch. Build window: Week 6 onward, after Product 1/2.*

## 1. Dependency order

Product 3 adds no new venue-domain schema — it reuses `venues`/`venue_configurations`/`venue_media`/`venue_availability`/`venue_restrictions`/`pricing_rules` and their existing landlord RLS policies (migrations `0002`, `0005`, `0017`–`0019`) as-is. New work is additive:

1. **`currencies`** (schema) — no dependents yet apart from what follows; must land first since two other new tables reference it.
2. **`landlord_invites`** (schema) — no dependency on `currencies`, can land in parallel with it.
3. **`landlord_payment_accounts`** (schema) — depends on `currencies` (FK).
4. **`pricing_rule_change_requests`** (schema) — depends on existing `pricing_rules`/`venues` only.
5. Backend endpoints (invite, venue self-add already covered by existing policy, pricing-request submit/review, payout account CRUD).
6. `/landlord/*` pages.
7. Staff-side additions to existing `/app/venues/[id]`.
8. RLS cross-tenant tests + verification.

## 2. Migrations (Alembic revisions — additive, per constitution #7)

Four small, focused revisions rather than one large one, matching the existing pattern (one revision per cohesive concern, e.g. `0005_pricing_rules.py`, `0017_venue_activations.py`):

- **`00XX_currencies.py`** — table + seed data (HKD at minimum; confirm THB/USD before merging, per PRD §9 open dependency) + RLS (public SELECT, staff ALL). Also alters `pricing_rules.currency` from free-text default to FK against `currencies.code` (existing rows get backfilled to 'HKD' before the constraint lands — same backfill-then-constrain pattern already used in `0007`/`0008`).
- **`00XX_landlord_invites.py`** — table + RLS (staff ALL, no other role has access — invites are an internal tracking artifact, never exposed to the invitee directly; Supabase Auth's own invite record is what the landlord interacts with).
- **`00XX_landlord_payment_accounts.py`** — table (FK to `currencies`) + RLS (`landlord_payment_accounts_landlord_own` mirroring the existing `venues_landlord_select_own` pattern; staff ALL).
- **`00XX_pricing_rule_change_requests.py`** — table + RLS: landlord INSERT/SELECT own venue's requests (ownership traced via `venues.landlord_id`, same join pattern as `pricing_rules_landlord_select_own` in `0005`), staff ALL including the `status` transition to `approved`/`rejected`. Landlord policy must not permit `UPDATE status` — enforce via column-level or trigger check, not just app-layer trust (test-security checklist will probe this).

Each revision ships its RLS in the same migration, per constitution #7 — no separate "add RLS later" task.

## 3. Backend (API)

- `POST /landlord-invites` — staff/admin only, calls Supabase Auth admin `inviteUserByEmail` server-side (service-role key never leaves the backend), writes a `landlord_invites` row.
- `POST /venues` (existing endpoint) — confirm it already accepts a landlord-authenticated caller and defaults `landlord_id = auth.uid()`, `status='pending_approval'` when called from `/landlord/*` — this is Path B in the PRD; likely just a policy-level guarantee already in place (`venues_landlord_insert_own`), verify rather than rebuild.
- `POST /venues/{id}/pricing-requests` — landlord submits a `pricing_rule_change_requests` row.
- `POST /venues/{id}/pricing-requests/{request_id}/approve|reject` — staff only; approve creates a new versioned `pricing_rules` row (never mutates an existing one — F3 reproducibility) and stamps `reviewed_by`/`reviewed_at`.
- `GET/PUT /landlord/payment-account` — landlord's own record; masked (`account_number` last-4 only) on any read path except the landlord's own edit form.
- `GET /currencies` — public reference data, no auth required.

## 4. Frontend

Per PRD §10 page inventory — `/landlord/login`, `/landlord` (flat venue list + "Add venue"), `/landlord/venues/[id]` (edit + pricing tab), `/landlord/payouts`. Middleware role gate: `has_role('landlord')`, redirect (not 403) on mismatch — matches the existing `/app/*`/`/vendor/*` pattern in `route-architecture.md`.

Staff-side: an "Invite landlord" action + pricing-request review tab added to the existing `/app/venues/[id]` — no new staff route.

## 5. Verification plan (maps to `verification.md`, written next)

- Cross-tenant denial: landlord A cannot see landlord B's venues, payment account, or pricing requests (extends the existing RLS test pattern from Product 1).
- A landlord cannot set `pricing_rule_change_requests.status` to `approved` directly (policy-level test, not just an API-layer check).
- Approving a pricing request produces a new `pricing_rules` row with correct `effective_from`, and a `proposal_venues` row quoted against the prior version still resolves correctly (F3 regression test).
- `currencies` FK backfill doesn't break any existing `pricing_rules` row (migration test against seed/demo data).
- Invite → accept → venue assignment round-trip (Path A) and invite → accept → self-add venue (Path B) both verified end-to-end.

## 6. Explicitly not in this plan

Stripe Connect integration, live exchange rates, landlord self-registration, landlord pricing/activation write access, revenue dashboards — all per PRD §8, unchanged.

## 7. Open item before `/tasks`

Confirm the `currencies` seed list (HKD + which others) — flagged in PRD §9, still unanswered. Cheap to decide now, awkward to backfill later if a `pricing_rules` row already references a currency code that doesn't exist yet.
