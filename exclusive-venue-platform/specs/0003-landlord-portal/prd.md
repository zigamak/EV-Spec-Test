# PRD — Product 3: Landlord Portal

*Authored directly, decided in-session 2026-07-27 (see product-brief.md for how this deviates from the "paste the Notion PRD" pipeline — no Notion source exists for this product). Status: Draft · Build window: Week 6 onward.*

## 1. Overview & Problem Statement

See `product-brief.md` §1. In short: the ownership path and RLS policies already exist (`venues.landlord_id`, `has_role('landlord')`); what's missing is the `/landlord/*` UI surface, the invite mechanism that gets a landlord an account in the first place, a payout-details record, and a bounded way for a landlord to influence pricing without becoming its authority.

## 2. Goals & Success Metric

See `product-brief.md` §2.

## 3. Users

See `product-brief.md` §3.

## 4. Core User Flow

There are two ways a landlord ends up managing a venue on the platform — both converge on the same review/edit loop:

**Path A — staff onboards an existing venue and brings the landlord in after:**
1. Staff creates the venue on `/app/venues` as today (unchanged) — `landlord_id` null initially.
2. Staff invites a landlord by email from the venue's staff-side profile page. If the email has no existing `auth.users` account, an invite is sent (Supabase Auth `inviteUserByEmail`, branded template) and a `landlord_invites` row tracks it; the venue's `landlord_id` is set once the invite is accepted.

**Path B — a landlord with an account adds their own venue directly:**
1. Staff invites the landlord first (email in, invite accepted) — same invite mechanism as Path A, just not yet tied to a specific venue.
2. From `/landlord`, the landlord clicks "Add venue" and creates it themselves — `landlord_id` set to their own `auth.uid()` automatically (existing `venues_landlord_insert_own` RLS policy), `status='pending_approval'` from the start. They cannot self-activate; staff still vets and approves before it's client-facing.

**From here on, both paths are identical:**
3. Landlord lands on `/landlord` — a flat list of their own venues (no grouping/portfolio concept — a landlord manages individual venues directly), whether staff-created-then-assigned or self-added.
4. Landlord edits their venue: description, address, media, configurations, availability blocks, restrictions — all via the existing per-table RLS `..._landlord_all_own` policies, no new authorization mechanism needed.
5. Landlord views current live pricing (read-only) and optionally submits a pricing change request — a proposed ruleset that does *not* take effect until staff reviews and approves it (see §6).
6. Landlord sets up payout details on `/landlord/payouts` — enters their own bank account information directly (self-service form, not staff-entered). Manual payout only in this build; no Stripe integration yet (see §6 and §9).
7. Staff reviews and approves any pending venue activation or pricing request from the existing `/app/venues/[id]` screen (small additions, not a new page) — this is the one step that's identical regardless of which path created the venue.

## 5. Functional Requirements

**Landlord invite**
Staff-only action (email address in, invite sent out) — no landlord self-registration, matching the existing platform-wide rule (`route-architecture.md`: "No self-registration anywhere"). Uses Supabase Auth's admin invite API from a backend endpoint gated to `has_role('staff')`/`has_role('admin')` — the service-role key this requires must never reach the client. Email content uses a standard, branded template (Supabase's customizable Invite User template), not ad-hoc text.

**My Venues (landlord dashboard)**
Flat list of venues where `landlord_id = auth.uid()`. No portfolio/grouping concept — confirmed not needed for v1. Staff/admin continue to see *all* venues (landlord-owned or not) unchanged on `/app/venues` — this is an additive surface, not a permission change for staff.

**Venue self-management**
Full CRUD on the landlord's own venue and its child records (media, configurations, availability, restrictions) — already covered by existing RLS policies (`venues_landlord_update_own`, `{table}_landlord_all_own`). A landlord can create a *new* venue too, which lands as `status='pending_approval'` (existing `venues_landlord_insert_own` policy) — cannot self-activate, unchanged from the original schema design.

**Pricing: propose, don't write**
Landlords get read-only access to the live `pricing_rules` for their venue (existing `pricing_rules_landlord_select_own` policy). To suggest a change, they write to a new `pricing_rule_change_requests` row instead of `pricing_rules` directly — status `pending`. Staff review/approve on `/app/venues/[id]`; approval is what actually creates/updates the real, versioned `pricing_rules` row. This preserves the constitution's trust boundary (pricing is deterministic-code-authoritative, never landlord- or AI-authoritative) while giving landlords real input.

**Payout account (manual, self-service)**
Landlord enters their own bank details directly on `/landlord/payouts` — no staff involvement, no Stripe integration in this build. Stored in `landlord_payment_accounts`. Actual payout execution remains a manual bank transfer performed by staff outside the app, same as today, just backed by one authoritative record instead of scattered emails. Given this table holds real bank account data (unlike a Stripe-backed version, where Stripe would hold it instead), it needs RLS locked to the owning landlord + staff, and masked display (last 4 digits) in any UI that isn't the landlord's own edit form.

**Currency reference table (shared foundation, not landlord-specific)**
A `currencies` table (code, symbol, name) that `pricing_rules.currency` and `landlord_payment_accounts.currency` both reference, replacing today's free-text `'HKD'` default. Built as shared foundation now because Product 4's vendor marketplace pricing needs the same reference data — introduced once, in `specs/0000-foundation/erd.md`, not redefined per product. Live/scheduled exchange-rate fetching is **not** included in this build — nothing in Product 3 or the current Product 4 plan actually converts between currencies yet, so a rate-fetching job would be speculative infrastructure for a need that doesn't exist. Add it later, against a real conversion requirement, not now.

## 6. The AI-vs-Deterministic Boundary (Product 3 specifics)

No AI involvement in this product at all — everything here is either direct landlord input (venue details, payout account, pricing suggestions) or deterministic staff approval. The one boundary worth restating: a landlord's proposed pricing change is a *suggestion*, structurally identical in trust level to how the constitution treats AI output — a human (staff) must approve it before it becomes real, authoritative pricing. The mechanism differs (a review-queue table, not a confidence score) but the principle is the same one already governing Product 1.

## 7. Acceptance Criteria

- A staff member can invite a landlord by email; the landlord receives a branded setup email and can complete account creation.
- A landlord can log in and sees only their own venues — verified with a cross-tenant test (landlord A cannot see landlord B's venues, extending the existing RLS test pattern).
- A landlord can edit their venue's details, media, availability, and restrictions, and the changes are visible on staff's `/app/venues/[id]` immediately.
- A landlord can view (not edit) their venue's live pricing, and submit a pricing change request that does *not* alter the live `pricing_rules` row until staff approves it.
- Approving a pricing request creates a new, correctly versioned `pricing_rules` row (`effective_from`/`effective_to` intact) — existing quotes referencing the prior version remain reproducible (F3 guarantee unaffected).
- A landlord can enter their own bank payout details; a staff member can view them (masked except on the landlord's own form) for manual payout purposes.
- `currencies` is queryable and `pricing_rules.currency`/`landlord_payment_accounts.currency` both reference it correctly; no live exchange-rate mechanism is built or expected in this milestone.

## 8. Out of Scope (Deferred)

- Stripe Connect (or any automated payout execution) — explicitly deferred as a "last, final feature" per direct instruction; manual payout ships first. Revisit once self-serve onboarding is actually viable for the landlord's country (flagged risk: Thailand-based Connect accounts currently require Stripe sales engagement, not self-serve Express onboarding — see `docs/progress.md` for the research).
- Live/scheduled currency exchange rates — table exists, rate-fetching does not, until a real conversion need exists.
- Landlord self-registration — invite-only, staff-initiated, no exceptions.
- Landlord self-activation of a venue, or any direct write to `pricing_rules` — both remain hard EV-controlled gates.
- Landlord revenue dashboards, booking/payment tracking — Phase 2, per `erd.md` §9, unaffected by this product.
- Portfolio/grouping concept above individual venues — flat list confirmed sufficient for v1.

## 9. Dependencies

- Product 1's venue domain tables and RLS policies (already built — `0002`, `0005`, `0017`–`0019`) — Product 3 adds no new venue-domain schema, only the payment/pricing-request/currency/invite additions above.
- Supabase Auth admin invite capability + a brandable email template — needs the same brand kit dependency Product 1 already tracks.
- A decision on where `currencies` seed data comes from (which currency codes to pre-populate — at minimum HKD, likely THB and USD given the Bangkok conversation) — small, but needs an explicit answer before the migration is written.

## 10. Page Inventory

| Page | Route | Features | Detailed Description | Notes |
|---|---|---|---|---|
| Login | /landlord/login | Auth | Supabase Auth sign-in, redirects unauthenticated `/landlord/*` visitors here. No self-registration. | Same pattern as `/app/login` |
| My Venues | /landlord | Venue list | Flat list of venues where `landlord_id = auth.uid()`, status badges (draft/pending_approval/active/inactive). Entry point to add a new venue. | No grouping/portfolio concept |
| Venue Detail/Edit | /landlord/venues/[id] | Venue Database (own-row RLS) | Edit description, address, district, amenities, media, configurations, availability, restrictions. Same data model as staff's Venue Profile, scoped to own venue by RLS. | Reuses existing RLS policies, no new authorization logic |
| Pricing tab | within Venue Detail | Pricing (read + propose) | View current live `pricing_rules` (read-only); submit/edit a pending `pricing_rule_change_requests` row. | Staff approval required to take effect |
| Payouts | /landlord/payouts | Payment | Self-service bank account entry (`landlord_payment_accounts`), manual only, no Stripe. | Stripe Connect deferred, see §8 |

**Staff-side additions (existing `/app/*` pages, not new routes):**

| Page | Route | Addition |
|---|---|---|
| Venue Profile | /app/venues/[id] | "Invite landlord" action (email in → invite sent, or assign an existing landlord user to `landlord_id`); a pricing-request review queue/tab (approve/reject `pricing_rule_change_requests`) |
