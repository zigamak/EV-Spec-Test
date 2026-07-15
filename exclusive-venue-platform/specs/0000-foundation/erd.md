# ERD — Cross-Product Database Schema

*Source: "ERD — Cross-Product Database Schema" (Notion, Draft, updated 2026-07-11). This file is the repo source of truth; the Notion page is the browsable reference.*

**Location in repo:** `specs/0000-foundation/erd.md` — the canonical schema. Product folders reference this; they never redefine it. Schema changes happen here first, then propagate.

**Database:** Supabase Postgres. All tables get RLS enabled (policies per `rls-matrix.md`). UUID primary keys via `gen_random_uuid()`. All tables carry `created_at` / `updated_at` unless noted.

## 1. Design principles this schema encodes

1. **One schema, four products.** Venues are written by staff (P1) and landlords (P3), read by the Concierge (P2) and proposals (P1/P2). Suppliers (P4) surface inside proposals. Everything lives in one coherent graph.
2. **Pricing rules are data, not text.** The deterministic pricing engine reads `pricing_rules` rows; there is no free-text pricing anywhere. Schema-level enforcement of the constitution's trust boundary.
3. **Anonymous-friendly enquiry intake.** The Concierge (P2) creates enquiries with no authenticated user. `enquiries.created_by` is nullable; identity lives in the linked `contacts` row.
4. **Ownership paths for RLS.** Every landlord-visible row traces to `venues.landlord_id`; every supplier-visible row traces to `suppliers.owner_user_id`. No ownership path = staff-only by default.
5. **AI outputs are stored as reviewable artifacts.** Parsed briefs carry `confidence` and `review_status`; AI copy lives in editable columns. Nothing AI-produced is authoritative until a human or deterministic check passes it.
6. **Deferred features get columns only where cheap.** No speculative tables for Phase 2.

## 2. Entity overview (by domain)

| Identity & Access | Venue Domain | Enquiry→Proposal Pipeline | Supplier Marketplace |
|---|---|---|---|
| profiles | venues | contacts | suppliers |
| user_roles | venue_configurations | organisations | supplier_media |
| | venue_media | enquiries | supplier_tags |
| | venue_availability | briefs | supplier_subscriptions |
| | venue_restrictions | proposals | proposal_suppliers |
| | pricing_rules | proposal_venues | |
| | pricing_rule_addons | proposal_link_tokens | |

## 3. Identity & access

**`profiles`** — extends Supabase `auth.users` 1:1 (id PK = auth.users.id, full_name, phone, avatar_url). Never store auth data here.

**`user_roles`** — one row per role grant: user_id FK, role CHECK IN ('staff','admin','landlord','supplier'), UNIQUE(user_id, role). A user can hold multiple roles. RLS anchor: helper `has_role(role)` checks this table; every policy uses it. Why not a role column on profiles? Multi-role users (and pilot-phase testing as all three roles) break single-column design immediately.

## 4. Venue domain

**`venues`** — id, name, slug UNIQUE, description, address, district, **landlord_id FK nullable** (null = EV-managed; set = P3 landlord-owned — the P3 RLS ownership path), **status** CHECK IN ('draft','pending_approval','active','inactive') — pending_approval = landlord submitted awaiting EV vetting; only 'active' venues visible to Concierge/proposals — approved_by, approved_at, hero_media_id.

**`venue_configurations`** — venue layouts with capacities (seated 80 / cocktail 150 / theatre 120): venue_id FK CASCADE, name, **capacity** (the recommendation engine filters on this), notes.

**`venue_media`** — venue_id FK CASCADE, storage_path (Supabase bucket `venue-media`), kind CHECK IN ('photo','video','floor_plan'), sort_order, caption.

**`venue_availability`** — stored as **blocked/booked windows, not open slots** — absence of a row = available: venue_id FK, starts_on, ends_on, reason CHECK IN ('booked','hold','maintenance','landlord_blocked','other'), **hold_expires_at** (nullable, only set when reason='hold' — a soft hold pending client confirmation, distinct from a confirmed booking; enforced by a CHECK constraint that every hold must carry an expiry), note. Engine rule (E1): venue available iff no overlapping row AND status='active' — a hold counts as unavailable the same as booked; only the calendar UI shows the countdown.

**`venue_restrictions`** — structured, filterable (not prose): kind CHECK IN ('no_amplified_music','no_smoking','no_open_flame','min_age','curfew','no_red_wine','other'), value, **hard boolean** (hard = deterministic filter excludes; soft = passed to AI re-rank as context). Extend enum as real venue data surfaces.

**`pricing_rules`** — the heart of the deterministic engine. One active ruleset per venue, **versioned by effective_from/effective_to** so historical quotes stay reproducible (F3 unit tests depend on this): currency (HKD), base_rate, **per_head_tiers jsonb**, **duration_multipliers jsonb**, **day_adjustments jsonb**, **season_adjustments jsonb**, min_spend, notes (human context only — the engine never reads it).

**`pricing_rule_addons`** — optional services: pricing_rules_id FK CASCADE, name, pricing_type CHECK IN ('flat','per_head','per_hour'), amount.

> **Why jsonb for tiers instead of child tables?** The engine consumes a ruleset atomically as one pure-function input; tiers never exist independently. jsonb keeps rule-versioning trivial (one row = one complete historical ruleset), compensated by schema validation in code (Zod/Pydantic) before save. Add-ons ARE a child table because proposals reference selected add-ons individually.

## 5. Enquiry → proposal pipeline

**`organisations`** — name, kind CHECK IN ('corporate','agency','brand','production_house','other') — mirrors EV's client categories.

**`contacts`** — deliberately independent of profiles (most contacts never log in): full_name, email (indexed for dedup, NOT unique — hard uniqueness would break Concierge intake), phone, organisation_id FK, source CHECK IN ('email','web_form','concierge','manual').

**`enquiries`** — the pipeline spine: contact_id FK nullable (raw inbound email may not yet be parsed), channel CHECK IN ('email','web_form','manual','concierge'), **raw_content** (original text verbatim — the parser's input, kept for re-parsing and the golden set), **stage** CHECK IN ('new','qualified','proposal_sent','follow_up','visit','negotiation','confirmed','lost') — note: follow_up and visit are status labels only in this build, no scheduling/reminder functionality attached (that's deferred Phase 2) — assigned_to FK, **created_by FK nullable** (null for anonymous intake), lost_reason.

**`briefs`** — the AI parser's structured output. **Separate versioned table** because enquiries get re-parsed and the brief is the engines' input contract: enquiry_id FK CASCADE, version, event_date, event_date_flexible, guest_count, event_type, budget_amount, **budget_basis CHECK IN ('total','per_head')** — the single field where a parsing mistake silently corrupts every downstream quote, hence explicit — duration_hours, location_preference, **requirements jsonb** (soft criteria for E2 re-rank), **confidence** (0–1), **review_status** CHECK IN ('auto_accepted','needs_review','human_approved','human_corrected'), reviewed_by, parser_model (reproducibility).

**`proposals`** — enquiry_id FK, **brief_id FK (pins which brief version priced this proposal)**, status CHECK IN ('draft','pending_approval','sent','viewed','accepted','declined') — pending_approval exists for P2's possible human-approval flow (client Decision 2) — title, intro_copy (AI-drafted, editable), **legal_boilerplate (snapshot at send time — terms changing later must not mutate sent proposals)**, currency, origin CHECK IN ('staff','concierge'), created_by nullable, sent_at.

**`proposal_venues`** — the 2–4 options in a proposal, each with its computed quote. **⚠️ Deliberate FK behavior, verified by testing:** venue_id/configuration_id/pricing_rules_id use RESTRICT, not CASCADE — a venue that has ever been quoted cannot be hard-deleted (blocked atomically, zero data loss, confirmed live). To retire a venue, set status='inactive'. This is the one FK where CASCADE would be actively harmful. proposal_id FK CASCADE, venue_id FK, configuration_id FK (which layout quoted), **pricing_rules_id FK — pins the exact ruleset version used, so quotes stay reproducible after rules change (F3)**, **quote_breakdown jsonb** (full engine output), quote_total (denormalized), venue_copy (AI-drafted, editable), sort_order (E2 re-rank writes this), recommended boolean.

**`proposal_link_tokens`** — tokenized shareable links (G5): proposal_id FK CASCADE, token UNIQUE (url-safe, ≥32 bytes), expires_at, revoked. Public link page reads via RPC/edge function — anon has NO direct SELECT on proposals.

## 6. Supplier marketplace (Product 4)

**`suppliers`** — **owner_user_id FK (the P4 RLS ownership path)**, business_name, slug UNIQUE, category CHECK IN ('florist','catering','lighting','entertainment','av','staffing','decor','other'), description, contacts, **status** CHECK IN ('draft','pending_approval','active','suspended') — same approval-before-live mechanic as venues; suspended = lapsed subscription auto-hides listing.

**`supplier_media`** — same shape as venue_media (bucket `supplier-media`; kinds photo/video/logo).

**`supplier_tags`** — matching metadata: supplier_id FK CASCADE, tag (e.g. 'white-party','luxury','outdoor'), UNIQUE(supplier_id, tag).

**`supplier_subscriptions`** — **local mirror of Stripe state; Stripe is the source of truth, this table caches it (webhook-maintained)**: stripe_customer_id, stripe_subscription_id UNIQUE nullable (null on Checkout-link MVP before first payment), tier CHECK IN ('standard','featured') — extend when EV confirms tiers (due Aug 21) — status CHECK IN ('active','past_due','canceled','incomplete'), current_period_end. App logic: supplier visible iff subscription active AND supplier.status='active'.

**`proposal_suppliers`** — suppliers surfaced in a specific proposal (static list for P2 MVP; tag-matched from P4 onward): proposal_id FK CASCADE, supplier_id FK, sort_order.

## 7. RLS matrix (summary — full policies in `rls-matrix.md`)

| Table | anon (public) | staff/admin | landlord | supplier |
|---|---|---|---|---|
| venues | SELECT where status='active' | ALL | SELECT/UPDATE own; INSERT as pending_approval only; cannot self-activate | — |
| venue_media/configs/availability/restrictions | SELECT via active venue | ALL | ALL on own venue's rows | — |
| pricing_rules(+addons) | **NO direct select — quotes via engine RPC only** | ALL | SELECT own venue's (no write) | — |
| contacts / organisations | INSERT via edge function only | ALL | — | — |
| enquiries / briefs | INSERT via edge function | ALL | — | — |
| proposals(+venues,+suppliers) | SELECT via token RPC only | ALL | — | — |
| suppliers/media/tags | SELECT where active AND subscription active | ALL | — | SELECT/UPDATE own; cannot self-activate |
| supplier_subscriptions | — | ALL | — | SELECT own |
| profiles / user_roles | — | ALL | SELECT own | SELECT own |

**Three deliberate hard lines:**

1. **anon never reads pricing_rules** — even if a live-pricing decision lands, the public sees engine output via RPC, never the rules. Rules are EV's commercial IP. That decision = policy tweak, not schema change.
2. **Landlords cannot write pricing or self-activate venues** — both EV-controlled gates. If EV later grants landlord pricing visibility, that's a SELECT policy change only.
3. **Suppliers cannot self-activate** — visibility = EV approval AND active Stripe subscription, enforced in the same policy.

## 8. Key indexes

enquiries(stage), enquiries(assigned_to), briefs(enquiry_id, version DESC), venues(status) WHERE active, venue_availability(venue_id, starts_on, ends_on), pricing_rules(venue_id, effective_from DESC), proposal_venues(proposal_id, sort_order), proposal_link_tokens(token) WHERE NOT revoked, contacts(email), suppliers(category) WHERE active.

## 9. Explicitly NOT in this schema (deferred — do not add speculatively)

| Deferred feature | Where it lands later |
|---|---|
| Tasks/checklists on enquiries | new `enquiry_tasks` (Phase 2) |
| Visit scheduling | new `visits` (Phase 2) |
| Contract/payment tracking | new `bookings` + `payments` (Phase 2) |
| Proposal open/view analytics | new `proposal_events`; proposals.status='viewed' becomes reachable |
| Newsletters/campaigns/segments | new tables + contact tags (Phase 2) |
| Landlord revenue dashboards | views over future bookings (blocked on visibility matrix anyway) |

Every deferred feature's migration path is **additive** — nothing in Phase 2 requires restructuring this schema. That was the point of designing it cross-product now.

## 10. Build order (maps to tasks.md A1)

1. profiles, user_roles (+ has_role helper)
2. organisations, contacts
3. venues → venue_configurations → venue_media → venue_availability → venue_restrictions
4. pricing_rules → pricing_rule_addons
5. enquiries → briefs
6. proposals → proposal_venues → proposal_link_tokens
7. suppliers → supplier_media → supplier_tags → supplier_subscriptions → proposal_suppliers
8. Indexes (§8), then RLS policies (A2, per rls-matrix.md)

### Revision-to-task map (updated 12 Jul — tables land incrementally, not upfront)

| Revision | Task | Tables |
|---|---|---|
| 0001 | A1 | profiles, user_roles (+ has_role helper) |
| 0002 | B1 | venues, venue_configurations, venue_media, venue_availability, venue_restrictions |
| 0003 | C1 | organisations, contacts, enquiries |
| 0004 | D1 | briefs |
| 0005 | F1 | pricing_rules, pricing_rule_addons |
| 0006 | G1 | proposals, proposal_venues, proposal_link_tokens |

Suppliers (suppliers, supplier_media, supplier_tags, supplier_subscriptions, proposal_suppliers) are Product 4 scope — their revision is cut in Week 6 when `specs/0004-supplier-marketplace/tasks.md` is populated, not part of the Product 1 sequence above.

## 11. Validation

This schema and migration were run against a **live Postgres 16 instance**, not just reviewed on paper: all 21 tables/12 indexes/21 RLS-enables execute clean; a full realistic data chain (organisation→contact→venue→config→pricing rules→anonymous enquiry→brief→proposal→priced proposal_venue) inserts successfully end to end; invalid status/budget_basis/date-range/duplicate-version/negative-capacity were all correctly rejected; deleting a venue with proposal history is blocked atomically with zero data loss — which is what surfaced the RESTRICT design decision documented in §5. **Update (12 Jul):** the hold_expires_at addition was re-validated on a fresh instance — a hold with no expiry is correctly rejected, a hold with an expiry succeeds, and normal bookings are unaffected.

*Prepared for specs/0000-foundation/erd.md · Exclusive Venue Platform · Pentanitive*
