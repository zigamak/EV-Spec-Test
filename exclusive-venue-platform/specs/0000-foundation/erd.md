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

**`organisations`** — name, kind CHECK IN ('corporate','agency','brand','production_house','other') — mirrors EV's client categories. **Client-context fields added 18 Jul, migration 0008 (task D5):** tier CHECK IN ('tier-1','tier-2','standard') nullable, rate_card_on_file boolean, rate_card_terms text, region text — surfaced on the enquiry/proposal UI the way the reference prototype's client panel does ("Tier-1 · Maison", "rate card on file"). Lifetime value / win rate / open-proposals-count are deliberately NOT columns — computed from `proposals`/`enquiries` at query time, same pattern as `enquiries.status` (§5.1).

**`contacts`** — deliberately independent of profiles (most contacts never log in): full_name, email (indexed for dedup, NOT unique — hard uniqueness would break Concierge intake), phone, organisation_id FK, source CHECK IN ('email','web_form','concierge','manual','whatsapp') — **'whatsapp' added 18 Jul, migration 0008**.

**`enquiries`** — the pipeline spine: contact_id FK nullable (raw inbound email may not yet be parsed), channel CHECK IN ('email','web_form','manual','concierge','whatsapp') — **'whatsapp' added 18 Jul, migration 0008**, **raw_content** (original text verbatim — the parser's input, kept for re-parsing and the golden set), **stage** CHECK IN ('enquiry','briefed','proposed','held','signed','lost') — **revised 18 Jul, migration 0007**; see §5.1 for the full lifecycle, transition graph, and why — assigned_to FK, **created_by FK nullable** (null for anonymous intake), lost_reason.

**`briefs`** — the AI parser's structured output, **standardized 18 Jul, migration 0008 (task D5)** into one contract every channel targets, not just email: enquiry_id FK CASCADE, version, **date_window_start/date_window_end** (a range, not a single date — renamed from the original `event_date`), **date_suggestions jsonb** (candidate specific dates, e.g. two Saturdays, when the window isn't narrowed yet), event_date_flexible (now means "exact date within the window still unconfirmed"), guest_count, event_type, duration_hours, **time_of_day** CHECK IN ('morning','afternoon','evening','full_day') nullable, budget_amount, **budget_basis CHECK IN ('total','per_head')** — the single field where a parsing mistake silently corrupts every downstream quote, hence explicit — **budget_status** CHECK IN ('confirmed','tbc','unspecified') (a "TBC" state distinct from simply unset), **budget_estimate_low/high** (an AI-estimated range for when it's TBC — both null or both set), location_preference, **requirements jsonb** (soft criteria for E2 re-rank; now has a *documented conventional shape* — `format_needs`, `tech_needs`, `mood`, `attachments` — enforced in app code, not a DB CHECK, same pattern as `pricing_rules`' jsonb tiers in §4), **confidence** (0–1, whole-brief), **flagged_fields/fields_to_confirm jsonb** (which *named* fields are uncertain or worth confirming with the client — confidence alone can't say that), **review_status** CHECK IN ('auto_accepted','needs_review','human_approved','human_corrected'), reviewed_by, parser_model (reproducibility).

The public web form (C2, not yet built) is the one path that fills these columns *without* going through the AI parser at all — a client answering structured form questions isn't a parsing problem, so that handler should construct the row directly (confidence=1.0, review_status='human_approved').

**`proposals`** — enquiry_id FK, **brief_id FK (pins which brief version priced this proposal)**, status CHECK IN ('draft','pending_approval','sent','viewed','accepted','declined') — pending_approval exists for P2's possible human-approval flow (client Decision 2) — title, intro_copy (AI-drafted, editable), **legal_boilerplate (snapshot at send time — terms changing later must not mutate sent proposals)**, currency, origin CHECK IN ('staff','concierge'), **event_date** (the *locked* date decided in the generate-and-share step, distinct from the brief's date_window_start/end which may still span a range — added 18 Jul, migration 0008), **personal_email_copy** (the AI-drafted note that accompanies a sent proposal — a separate artifact from intro_copy, confirmed as a real feature on the reference prototype, not a backlog guess — added 18 Jul, migration 0008), created_by nullable, sent_at.

**`proposal_venues`** — the 2–4 options in a proposal, each with its computed quote. **⚠️ Deliberate FK behavior, verified by testing:** venue_id/configuration_id/pricing_rules_id use RESTRICT, not CASCADE — a venue that has ever been quoted cannot be hard-deleted (blocked atomically, zero data loss, confirmed live). To retire a venue, set status='inactive'. This is the one FK where CASCADE would be actively harmful. proposal_id FK CASCADE, venue_id FK, configuration_id FK (which layout quoted), **pricing_rules_id FK — pins the exact ruleset version used, so quotes stay reproducible after rules change (F3)**, **quote_breakdown jsonb** (full engine output), quote_total (denormalized), venue_copy (AI-drafted, editable), sort_order (E2 re-rank writes this), recommended boolean.

**`proposal_link_tokens`** — tokenized shareable links (G5): proposal_id FK CASCADE, token UNIQUE (url-safe, ≥32 bytes), expires_at, revoked. Public link page reads via RPC/edge function — anon has NO direct SELECT on proposals.

### 5.1 Enquiry lifecycle — canonical stage model (revised 18 Jul)

*History: first resolved 18 Jul by keeping the original 8-stage build (new/qualified/proposal_sent/follow_up/visit/negotiation/confirmed/lost) as canonical against the reference prototype's simpler Open/Awaiting/Won status. Superseded the same day once fuller workflow context (the full Inquiries → Proposal → Pipeline → Client journey, including the 4-step proposal builder and the explicit 5-stage Kanban) made clear the intended pipeline is Enquiry → Briefed → Proposed → Held → Signed, not the original 8-stage build. Migration `0007_enquiry_stage_revamp.py` carries out the change; the status rollup below is unaffected in shape, only in which stages feed each bucket.*

**The core engine, in one line:** an inbound enquiry gets turned into a priced proposal; that proposal is tracked as a deal until signed; every step is logged permanently against the client's record. `stage` is the deal's position in that journey; `status` (below) is the coarser Open/Awaiting/Won/Lost lens salespeople and reporting actually look at day to day.

**Stage → trigger table** (who/what moves an enquiry from one stage to the next):

| Stage | Meaning | Trigger | Who/what |
|---|---|---|---|
| `enquiry` | Enquiry captured, not yet reviewed — lands on the Inquiries page like a shared inbox | Automatic, on intake | System — C2 public web form / C3 staff manual entry / C4 Resend email webhook |
| `briefed` | Operator opened the enquiry, the AI Concierge extracted a structured brief (D1–D4), operator confirmed/corrected it, and chose "Build proposal" over declining or forwarding | Manual — `POST /enquiries/{id}/transition` | Staff. This is the handoff into the proposal builder's Step 1 |
| `proposed` | Proposal built (venues curated, pricing generated, link/PDF/email compiled and sent — G0–G3, the proposal builder's Steps 2–4) | Manual — `POST /enquiries/{id}/transition`. **Currently a separate action from the proposal's own "Mark as sent" (G3) — not auto-coupled; see H3 below** | Staff |
| `held` | A soft hold is placed on a venue/date while the client decides — tracked with an expiry (see `venue_availability.hold_expires_at`, erd.md §4) | Manual | Staff. `held` can lapse back to `proposed` if the hold expires unconverted — a real transition, not a dead end (see Calendar/Booking, §9) |
| `signed` (terminal) | Deal won, contract signed | Manual | Staff — the pipeline's "Won" outcome |
| `lost` (terminal, reachable from any non-terminal stage, requires `lost_reason`) | Enquiry declined or fell through | Manual | Staff — covers both the initial "decline politely" triage choice and a deal falling through later, on the same terms |

**Transition graph** (`api/app/services/stage_machine.py`): `enquiry → briefed → proposed → {held, signed}`, `held → {signed, proposed}` (the lapse-back case), `lost` reachable from any of `enquiry`/`briefed`/`proposed`/`held`. `signed` and `lost` are terminal.

**Status rollup** (computed for salesperson/reporting views — e.g. a Pipeline Board grouping or a status pill — never a stored column, never replaces `stage`):

- **Open** — `enquiry`, `briefed`
- **Awaiting** — `proposed`, `held`
- **Won** — `signed`
- **Lost** — `lost`

**Where the rest of the full workflow lands (not all built yet — tracked separately, not schema changes here unless noted):**

- *Client profile panel on the enquiry card* (account tier, lifetime value, assigned account manager) — reads from `contacts`/`organisations` plus proposal/enquiry history; no new columns needed, a UI/query concern (Client page, already scoped).
- *Decline / Forward triage actions* — Decline = transition to `lost` with `lost_reason`; Forward = `POST /enquiries/{id}/assign` (already built) reassigning to another salesperson, stage unchanged. Both exist at the API level; a dedicated "Forward" UI affordance with a context note is a small follow-up.
- *4-step proposal builder UI (The enquiry / Curate venues / Generate pricing / Generate & share)* — maps directly onto D1–D4 (brief), E1–E2 (curation, still AI-assisted re-rank per the constitution, not purely manual), F1–F5 (pricing), G1–G5 (generate & share). No new engines; the builder is a UI sequencing concern over engines that already exist or are scoped.
- *Lock-per-option pricing before moving on* — backlog UX idea, not costed, not blocking M1.
- *Branded proposal email (distinct from the web link/PDF) with open/click tracking* — the email-with-attachments send is a 4th AI-copy prompt not yet scoped (backlog); open/click tracking is explicitly deferred to Phase 2 (`proposal_events`, §9) same as before.
- *Pipeline dashboard totals (pipeline value, QTD revenue, win rate vs. benchmark)* — aggregation over `enquiries`/`proposals`, no new tables; a reporting-layer task, not scoped yet.
- *Clients page as full relationship timeline* (interleaving every enquiry email, brief, proposal, event, onboarding note) — already scoped as the Client page (J1) at a lighter weight; the full interleaved timeline view is an extension of the same data, not a new domain.
- *Contacts as a shared directory auto-populated from enquiries* — already how `contacts` works today (created on intake); a dedicated Contacts *page* (browse/search independent of an enquiry) is UI not yet scoped.
- *Calendar/Booking with hold expiry countdowns* — `venue_availability` already models holds with `hold_expires_at` (erd.md §4); the Calendar page (J2) already renders them. The *countdown* UI treatment and auto-lapsing a hold back to `proposed` when it expires (vs. relying on staff to notice) is a follow-up, not a schema gap.

### 5.2 The standardized brief contract (task D5, 18 Jul, migration 0008)

*Why this exists:* live-browsing the reference prototype's actual Concierge briefing UI (exclusive-venue-internal-ai-sales.netlify.app — a real Dior enquiry) showed a much richer field set than the original `briefs` table (0004) supported: client tier + rate card context, a date *window* with suggested alternates instead of one date, a "TBC" budget with an AI-estimated range instead of one nullable number, mood/format/tech needs, and per-field confidence flags instead of one whole-brief score. None of that was representable before.

**The core rule: one brief contract, regardless of channel.** Email, WhatsApp, and a manual staff note all reach `app/services/brief_parser.py::parse_enquiry()` and land on exactly the same fields — the AI's job is to fill this shape, not to invent its own per-channel structure. The public web form (C2, not yet built) is the deliberate exception: a client answering structured form questions isn't a parsing problem, so that intake path should construct a `ParsedBrief` directly from the submitted values (confidence=1.0, review_status='human_approved'), skipping the AI parser entirely rather than serializing the form back into free text just to re-parse it.

Example of what a fully-populated brief now looks like (based on the real Dior enquiry observed live), shown as the API's JSON shape:

```json
{
  "date_window_start": "2026-06-28",
  "date_window_end": "2026-07-05",
  "date_suggestions": ["2026-06-28", "2026-07-05"],
  "event_date_flexible": true,
  "guest_count": 48,
  "event_type": "Brand · cocktail",
  "duration_hours": 3,
  "time_of_day": "afternoon",
  "budget_amount": null,
  "budget_basis": null,
  "budget_status": "tbc",
  "budget_estimate_low": 110000,
  "budget_estimate_high": 180000,
  "location_preference": null,
  "requirements": {
    "format_needs": ["panel", "certificate", "f&b"],
    "tech_needs": ["branded_backdrop", "av"],
    "mood": ["considered", "light", "sense of arrival"],
    "attachments": [{"name": "Dior_event_moodboard.pdf", "url": "..."}]
  },
  "confidence": 0.96,
  "flagged_fields": ["date_window_end"],
  "fields_to_confirm": ["date_window_end", "budget_status"],
  "review_status": "auto_accepted"
}
```

`requirements` stays a genuinely free-form jsonb column — `format_needs`/`tech_needs`/`mood`/`attachments` are a *documented convention* (`app/schemas/brief.py::REQUIREMENTS_CONVENTIONAL_KEYS`), validated in application code, not a database CHECK. This is the same trade-off `pricing_rules`' jsonb tiers make in §4: keeps the column extensible for an unusual enquiry without a migration, while still giving the UI a predictable shape to render for the common case — the "use JSON but keep it standardized enough to render right" balance.

Client-context fields (tier, rate card, region) live on `organisations`, not `briefs` — they describe the client relationship, not this particular enquiry, and are already available before a brief is even parsed (see §5's `organisations` entry).

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
| 0007 | H3 | enquiries.stage — ALTER only, remaps 8 old values to the 5-stage model (enquiry/briefed/proposed/held/signed) + lost, replaces the CHECK constraint; see §5.1 |
| 0008 | D5 | ALTER only — standardizes `briefs` (date window + suggestions, time_of_day, budget_status + estimate range, flagged_fields/fields_to_confirm), adds 'whatsapp' to `enquiries.channel`/`contacts.source`, adds tier/rate_card_on_file/rate_card_terms/region to `organisations`, adds event_date/personal_email_copy to `proposals` |

Suppliers (suppliers, supplier_media, supplier_tags, supplier_subscriptions, proposal_suppliers) are Product 4 scope — their revision is cut in Week 6 when `specs/0004-supplier-marketplace/tasks.md` is populated, not part of the Product 1 sequence above.

## 11. Validation

This schema and migration were run against a **live Postgres 16 instance**, not just reviewed on paper: all 21 tables/12 indexes/21 RLS-enables execute clean; a full realistic data chain (organisation→contact→venue→config→pricing rules→anonymous enquiry→brief→proposal→priced proposal_venue) inserts successfully end to end; invalid status/budget_basis/date-range/duplicate-version/negative-capacity were all correctly rejected; deleting a venue with proposal history is blocked atomically with zero data loss — which is what surfaced the RESTRICT design decision documented in §5. **Update (12 Jul):** the hold_expires_at addition was re-validated on a fresh instance — a hold with no expiry is correctly rejected, a hold with an expiry succeeds, and normal bookings are unaffected.

*Prepared for specs/0000-foundation/erd.md · Exclusive Venue Platform · Pentanitive*
