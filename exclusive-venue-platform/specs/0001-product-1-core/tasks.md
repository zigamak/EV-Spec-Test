# Tasks — Product 1 Core

*Seeded from "SDD Repo Setup Guide — Exclusive Venue" §8 (Notion, Approved, updated 12 Jul). Sprint Board rows are sized in hours for humans; this file is sized for the agent in atomic, few-file units with hard dependencies. Table-creating tasks cut their own Alembic revision, incrementally — see docs/stack-profile.md and specs/0000-foundation/erd.md §10 for the revision map. Non-engineering Sprint Board rows never enter this file (setup guide §7 filter rule).*

# Legend: [deps] = must be complete first. One task ≈ one focused agent session.

## A. Schema & Infra (from Week 1 — may already be done at seed time)
- [x] A1. Alembic environment setup (`alembic.ini`, `migrations/env.py` wired
      to the Supabase connection string) + revision 0001: `profiles`,
      `user_roles` (+ `has_role()` helper) + RLS on both  [deps: 0000/erd.md §3]
      — `api/` FastAPI skeleton scaffolded alongside it (deps for alembic +
      the service live in `api/requirements.txt`). Migration is
      hand-written, not yet applied to a live Supabase instance — needs
      `SUPABASE_DB_URL` + `pip install -r api/requirements.txt` +
      `alembic upgrade head` from repo root.
- [x] A2. Staff login page (Supabase Auth UI + session handling). Blocks
      every other authenticated route.  [A1]
      — `web/` Next.js skeleton scaffolded (App Router, TS strict);
      `/app/login` + `web/middleware.ts` role gate implemented. Not yet run
      — needs `npm install` + `NEXT_PUBLIC_SUPABASE_URL`/`ANON_KEY` in
      `web/.env.local`.

> Migration note: this is the only table-creating task in group A. Everything
> else that needs new tables cuts its own Alembic revision inside the task
> that needs it (see the "— Alembic revision" lines below and the revision
> map in 0000-foundation/erd.md §10) — not a big upfront schema dump. RLS
> ships in the same revision as its table, so there's no separate RLS sweep
> task either.

## B. Venue Database Module
- [x] B1. **Alembic revision 0002:** venues, venue_configurations,
      venue_media, venue_availability, venue_restrictions + RLS (staff ALL;
      landlord SELECT/UPDATE own; anon SELECT where active). Then: API —
      venue CRUD endpoints (FastAPI) + validation  [A1]
      — Applied to the live Supabase project; RLS-scoped CRUD router at
      `api/app/routers/venues.py` (venues + nested configurations/
      restrictions/availability), verified end-to-end against the live DB
      (create/read/update/approve/delete, hold-without-expiry correctly
      rejected by the CHECK constraint, self-activation correctly blocked
      by RLS). Media upload endpoints deferred to B2 (Storage).
- [x] B2. Storage: media upload to Supabase bucket, signed URLs  [A1]
      — Private `venue-media` bucket (`scripts/create_storage_buckets.py`,
      idempotent). `api/app/routers/venue_media.py`: upload/list/update/
      delete on `venue_media`, gated by the row-level RLS insert (the
      object never touches storage unless the DB write is authorized
      first) with signed URLs (1hr TTL) via `api/app/core/storage.py`.
      Live-verified: upload, signed URL resolves to the exact bytes sent,
      update, delete (confirmed removed from both DB and storage).
- [x] B3. UI: venue list + detail (staff surface, provisional tokens)  [B1]
      — covers two distinct pages: Venue Library (list/search/filter at
      /app/venues) and Venue Profile (detail at /app/venues/[id])
      Venue Library: search (name/district/slug) + status filter, table
      view. Venue Profile: configurations, restrictions, read-only media
      thumbnails, staff-only Approve action for pending_approval venues.
      New `web/lib/api/client.ts` (RLS-scoped fetch wrapper) +
      `web/lib/api/types.ts`. CORS added to `api/app/main.py` (dev-only
      origin allowlist) so the browser can call the API cross-origin.
      Browser-driven (Playwright) smoke test: real login → Venue Library
      renders a live venue → Venue Profile shows its configuration and
      restriction → zero console errors. Create/edit form is B4; media
      upload/reorder UI is B5 — this page only displays what's there.
- [x] B4. UI: venue create/edit form incl. configurations + rules fields  [B1]
      — `/app/venues/new` (create) + `/app/venues/[id]/edit` (edit venue
      fields, add/remove configurations, add/remove restrictions). Reuses
      B1's existing CRUD endpoints — no API changes needed. "Edit" link
      added to Venue Profile, "+ New venue" to Venue Library. Browser-driven
      (Playwright) smoke test against the live DB, zero console errors;
      test venue cleaned up afterward.
- [x] B5. UI: media gallery upload/reorder  [B2, B3]
      — added to the Venue Profile edit page: upload (multipart), up/down
      reorder buttons swap sort_order, remove. Browser-verified end to end.
- [x] B6. Availability calendar: month-view UI over venue_availability (table
      already exists from B1's revision — no new migration here)  [B1]
      — added to Venue Profile: month grid colored by reason (booked/hold/
      maintenance/etc.), add-block form (holds require an expiry per the
      existing CHECK constraint), click-to-remove. Browser-verified.

## C. Enquiry Intake
- [x] C1. **Alembic revision 0003:** organisations, contacts, enquiries + RLS
      (anon INSERT via edge function only; staff ALL). Then: enquiries table
      wiring + statuses  [A1]
      — applied live. `api/app/routers/enquiries.py`: CRUD for all three
      tables, RLS-scoped. No anon policy on any of the three (matches "no
      edge function exists yet in this repo" — the eventual C2/C4 public
      write path is a service-role call, not a direct anon-key insert).
      Live-verified (org/contact/enquiry create, stage filter, cleanup).
- [ ] C2. Public web enquiry form → creates enquiry  [C1]
- [x] C3. Staff manual-entry form  [C1, B3]
      — `web/app/app/NewEnquiryModal.tsx`, a modal (not a route) triggered
      from the Pipeline Board's "+ New enquiry" button. Optionally creates
      an organisation + contact before the enquiry. Browser-verified.
- [x] C4. Resend inbound webhook: enquiries@ → raw enquiry record  [C1]
      — `POST /webhooks/resend/inbound-email`, unauthenticated (Resend's
      servers call it, not a staff session): Svix-scheme signature
      verification (`app/services/webhook_verification.py`, 5 unit tests
      incl. tampered-body/wrong-secret/stale-timestamp rejection) gates
      every byte before it's trusted; a missing `RESEND_WEBHOOK_SECRET`
      fails closed (503), unlike the AI paths' fail-soft pattern — an
      unauthenticated public endpoint accepting unsigned input would be a
      real hole, not a UX inconvenience. Finds-or-creates a contact by
      email, then inserts the enquiry, via the service-role client (same
      "plays the edge-function role" pattern as public_proposals.py).
      Live-verified with a self-signed test payload against a throwaway
      instance (valid signature → enquiry+contact created and confirmed
      in the DB, then cleaned up; tampered body → 401).
      **Payload shape unverified against a live Resend account** — no
      inbound-email domain is configured in this environment, so
      `app/schemas/webhook.py`'s field names are written from Resend's
      docs, not a captured real payload. Revisit once a real domain is set up.

## D. AI Brief Parser
- [x] D1. **Alembic revision 0004:** briefs + RLS (staff ALL; no anon
      access). Then: GPT tool-calling schema — enquiry text → structured
      brief JSON (date, guests, event type, budget, location, requirements,
      contact)  [C1]
      — applied live. `app/services/brief_parser.py`: tool-calling schema +
      `parse_enquiry()`; `app/routers/briefs.py`: parse/list/get/patch.
      Switched from Anthropic to OpenAI (`gpt-4o-mini`) on 13 Jul — see
      progress.md.
      **Caveat: no `OPENAI_API_KEY` configured in this dev environment**
      — the actual GPT call is untested live; verified instead that a
      missing key fails loudly (503) rather than silently, and that the
      persist/list/review-patch flow around it works (tested via a
      manually inserted fixture brief). Needs a real key + a live run
      before this is considered fully verified.
- [x] D2. Confidence scoring + low-confidence → human-review flag  [D1]
      — deterministic threshold (`AUTO_ACCEPT_THRESHOLD = 0.75`) in
      `brief_parser.score_review_status()`, unit tested.
- [x] D3. Golden test harness: run parser vs fixtures/anonymized/, diff report  [D1]
      — `api/tests/test_golden_briefs.py` + 3 synthetic fixtures (not real
      client data — the actual client pricing/enquiry export is a Sprint
      Board human task, not yet done). Skips cleanly (not a failure) when
      no API key is configured; wire the real key into CI (I1) to make it
      load-bearing.
- [x] D4. Staff UI: review/correct parsed brief  [D2, C3]
      — built as part of the unified command center (G0) at
      `/app/enquiries/[id]` rather than a separate page — editable brief
      form (all fields), "Parse with AI"/"Re-parse" trigger, "Approve
      as-is". Degrades to a clear notice (not a crash) when parsing is
      unavailable. Browser-verified.
- [x] D5. (added 18 Jul, after live-browsing the reference prototype's
      actual Concierge briefing UI — real Dior enquiry, "9 fields, 1
      flagged", client tier + rate card, a date window with suggested
      dates, a TBC budget with an estimated range, mood/format/tech
      needs) Standardize the brief contract into one shape every intake
      channel targets — email, WhatsApp, or a manual note through the AI
      parser; the eventual public web form (C2) filling it directly,
      deterministically, no AI involved. See
      0000-foundation/erd.md §5.2 for the full field-by-field writeup and
      an example payload.  [D1]
      — **Alembic revision 0008** (ALTER only, does not edit 0004 — see
      constitution rule #8): `briefs.event_date` renamed to
      `date_window_start`, new `date_window_end`, `date_suggestions`,
      `time_of_day`, `budget_status`, `budget_estimate_low/high`,
      `flagged_fields`, `fields_to_confirm`; `enquiries.channel` and
      `contacts.source` gain `'whatsapp'`; `organisations` gains `tier`,
      `rate_card_on_file`, `rate_card_terms`, `region`; `proposals` gains
      `event_date` (the locked date, distinct from the brief's window)
      and `personal_email_copy` (the AI-drafted note that accompanies a
      sent proposal, separate from `intro_copy`). `app/schemas/brief.py`
      (`ParsedBrief`/`BriefUpdate`/`Brief`) rewritten with two new
      model-level validators (date window order, budget estimate range
      both-or-neither) — both unit-verified directly. `brief_parser.py`'s
      `EXTRACT_BRIEF_TOOL` rewritten to target the new fields.
      `routers/recommendations.py` and `routers/proposals.py` updated for
      the renamed column (shortlisting/pricing use `date_window_start` as
      the effective single date until a proposal locks a real one).
      `web/lib/api/types.ts` and every frontend reference to
      `brief.event_date` (Pipeline Board, Calendar, Command Center)
      updated to match. `scripts/seed_demo_enquiries.py` updated —
      the Luxe & Co. entry is now a full standardized-brief showcase
      (tier, rate card, date window + suggestions, TBC budget + estimate,
      mood/format/tech needs, flagged fields) plus a WhatsApp-channel
      entry proving the contract really is channel-agnostic.
      **Not yet applied to any live database** — same caveat as 0007, no
      Supabase credentials in this environment.

## E. Recommendation Engine
- [x] E1. Deterministic filter: capacity + availability + restrictions +
      budget fit → shortlist. Pure function, unit tested.  [B1, B6, D1]
      — `app/services/recommendation_engine.py::filter_venues`. Budget fit
      reuses F2's pricing calculator (built first so this could compute a
      real estimated quote instead of a min_spend-only heuristic), with a
      15% tolerance buffer over the stated budget. 16 unit tests + live
      end-to-end verification via `GET /briefs/{id}/shortlist`.
      **Extended 15 Jul** (G0/G3 build): `ShortlistEntry` now also carries
      `pricing_rules_id` + the full `quote_breakdown` when a pricing rule
      matched, so a proposal can be created straight from a shortlist
      entry without a second quote lookup. 2 more unit tests.
- [x] E2. GPT re-rank of shortlist vs soft criteria; NEVER adds/removes
      venues, only reorders  [E1]
      — `recommendation_engine.rerank_shortlist`. Structurally enforced:
      if the model's reorder doesn't contain exactly the input venue_ids,
      falls back to E1's order rather than trust it (unit tested). Same
      **no OPENAI_API_KEY** caveat as D1 — the live call is untested.

## F. Pricing Engine  ← deterministic only; zero AI in call path
- [x] F1. **Alembic revision 0005:** pricing_rules, pricing_rule_addons + RLS
      (anon: no direct SELECT, quotes via engine RPC only; staff ALL;
      landlord SELECT own, no write). Then: pricing rule schema — base rate,
      per-head tiers, duration multipliers, season/day-of-week adjustments,
      add-ons — as data  [A1]
      — applied live; done ahead of E1 in build order since E1's budget
      fit genuinely needs this to exist first (see E1 note above).
- [x] F2. Pricing calculator: pure function over (venue rules × brief)  [F1]
      — `app/services/pricing_engine.py::calculate_quote`. jsonb shapes
      documented in the module docstring (per-head tiers, duration
      overtime, day/season multipliers, addons, min_spend floor).
- [x] F3. Unit tests: reproduce ≥10 real historical quotes within rounding  [F2]
      — 17 synthetic-scenario tests, not real historical quotes (client's
      pricing spreadsheet conversion is a Sprint Board human task, not yet
      done — see CLAUDE.md). Each test isolates one calculator behavior so
      real quote fixtures can be dropped in later without touching the engine.
      Live-verified via the `/quote` endpoint end to end (math checked by hand).
- [x] F4. Staff UI: rules editor per venue  [F1, B4]
      — `web/app/app/venues/[id]/edit/PricingRulesTab.tsx`, a tab within
      the Venue edit page (not a standalone route). Simplified entry
      surface over the jsonb shapes: one flat per-head rate, Friday/
      Saturday day-of-week multipliers, included-hours + overtime rate,
      min spend, plus add-ons and a "test quote" calculator that calls
      the real `/quote` endpoint. Browser-verified against a seeded venue.
- [x] F5. Seed script: 3 demo venues with configs + pricing rules  [B4, F1]
      — `scripts/seed_demo_venues.py` (idempotent, matches by slug). Run
      live: 3 venues seeded (Peak Skyline Hall, Wan Chai Warehouse Loft,
      Repulse Bay Garden Pavilion) each with 2 configurations, 1-2
      restrictions, 1 pricing rule, 1-2 add-ons — left in the live DB
      intentionally as demo/QA fixtures (not cleaned up, unlike this
      session's throwaway enquiries/proposals).

## G. Proposal Builder
- [x] G0. Staff UI: unified enquiry command center — raw message, editable
      parsed brief, recommended + priced venue shortlist, all in one view
      at /app/enquiries/[id], before proposal generation  [D4, E2, F2]
      — `web/app/app/enquiries/[id]/page.tsx`. Also folds in H1's
      enquiry-detail need (stage transition buttons, assignment) and D4
      (brief editor), so H2 only had to add the kanban board itself.
      "Create proposal from shortlist" button creates the proposal +
      all its proposal_venues rows in one action, using the shortlist
      entry's carried-through pricing_rules_id/quote_breakdown (E1 was
      extended to expose these — see E1 note below). Browser-verified
      full round trip: shortlist → proposal → editor.
- [x] G1. **Alembic revision 0006:** proposals, proposal_venues,
      proposal_link_tokens + RLS (anon SELECT via token RPC only; staff
      ALL). Then: proposal data model — brief + selected venues + computed
      prices + copy blocks + legal boilerplate  [E1, F2]
      — applied live. `app/routers/proposals.py` (staff CRUD for all three
      tables + send/link-token generation/revoke) + `app/routers/
      public_proposals.py` (`GET /public/proposals/{token}`, unauthenticated,
      via the service-role client — plays the edge-function role this repo
      has no Supabase Edge Function scaffolding for; validates
      expiry/revocation in code before returning anything, and returns a
      narrowed view with no internal ids/pricing_rules_id). Live-verified:
      create → add priced venue → RESTRICT blocks deleting a quoted venue
      → send → generate link → public read succeeds → revoke → public
      read correctly 410s.
- [x] G2. GPT copy generation per venue (brand voice, editable)  [G1]
      — `app/services/copy_generator.py` (plain GPT completion, not
      tool-calling — this is prose, not extraction) + two endpoints:
      `POST /proposals/{id}/generate-intro-copy` and `POST /proposals/
      {id}/venues/{id}/generate-copy`. Output lands in the same plain
      editable `intro_copy`/`venue_copy` columns G1 already had — no
      "AI-locked" state. Same **no OPENAI_API_KEY** caveat as D1/E2:
      verified the 503 fallback live, the actual generation is untested.
- [x] G3. Staff UI: proposal editor (select venues, adjust, edit copy)  [G1, D4]
      — `web/app/app/proposals/[id]/page.tsx`: intro copy (editable +
      "Generate with AI"), per-venue cards (quote total, editable copy +
      generate, recommended toggle, remove), "Mark as sent", shareable
      link create/revoke. Venue *selection* happens at proposal-creation
      time via G0's shortlist, not in this editor (removing a venue here
      just drops it from the proposal). Browser-verified full flow:
      created a proposal from a 3-venue shortlist, saved intro copy
      manually (AI unavailable, correctly surfaced), created + revoked a
      link, marked sent.
      **Real bug found and fixed along the way**: `web/lib/supabase/
      client.ts`'s `createClient()` created a brand-new Supabase client
      on every single `apiFetch()` call. Modern `@supabase/supabase-js`
      serializes session/token-refresh access across client instances
      sharing the same storage key via the browser's Web Locks API —
      this page is the first one to fire 3 sequential `apiFetch` calls
      in a row (proposal → venues → links), and that was enough to hit
      real lock contention, silently hanging the second/third call
      forever with no error. Fixed by making `createClient()` a module-
      level singleton (supabase's own recommended pattern). This bug was
      latent in every page all session — it just needed 3+ sequential
      calls on one page to manifest, which nothing before this page did.
- [ ] G4. PDF export (branded template)  [G3; Tier-2 design gate]
- [ ] G5. Tokenized shareable link page (public read-only)  [G3; Tier-2 gate]
      — the data endpoint it needs (`GET /public/proposals/{token}`) already
      exists from G1; only the actual page UI is left, gated on the brand kit anyway.
- [~] G6. Guided 4-step Proposal Builder (reference "Inquiry → Proposal"
      workflow) at `/app/proposals/new?enquiry={id}` — a wizard over the
      already-built endpoints (no new API), with a draft proposal as the
      autosave target. Entered from the Inquiries inbox "Build proposal".  [G0–G3]
      — **Step 1 (The Enquiry) DONE**: raw email + structured briefing card
      (confidence, flagged/to-confirm, mood/format/tech, TBC budget), re-parse.
      — **Step 2 (Curate venues) DONE**: portfolio grid + "Fits brief"
      shortlist, 1–5 pick persisted to proposal_venues on toggle. Category
      ribbon deferred (no venue `category` column yet).
      — **Step 3 (Generate pricing) PENDING**: per-venue quote breakdown from
      each proposal_venue's stored `quote_breakdown`/`quote_total`, with a
      manual override (`PATCH /proposals/{id}/venues/{pv}`). Endpoints exist.
      — **Step 4 (Generate & share) PENDING**: intro copy
      (`generate-intro-copy`) + shareable web link (`/links`). PDF stays G4.
      Endpoints exist; only the screens are left.

## H. CRM Pipeline
- [x] H1. Stage machine: Enquiry → Briefed → Proposed → Held → Signed;
      `held` can lapse back to `proposed`; `lost` reachable from any
      non-terminal stage; assignment. Originally shipped 12 Jul against
      revision 0003's 8-value stage list (new/qualified/proposal_sent/
      follow_up/visit/negotiation/confirmed/lost); **revamped 18 Jul to the
      5-stage model above** via a new ALTER revision (0007) rather than an
      edit to 0003 — see H3 and 0000-foundation/erd.md §5.1.  [C1]
      — `app/services/stage_machine.py` (deterministic transition graph,
      `lost` reachable from any non-terminal stage, `signed`/`lost` both
      terminal, `held → proposed` as the hold-lapse case) + `POST /enquiries/
      {id}/transition` (409 on an invalid jump, 422 if moving to `lost` with
      no `lost_reason`) + `POST /enquiries/{id}/assign`. Deliberately
      removed `stage` from the plain `PATCH /enquiries/{id}` payload so the
      transition endpoint is the only path that can change it. 13 unit
      tests (rewritten 18 Jul for the 5-stage model) + live verification of
      the original 8-stage version (5-stage version not yet run against a
      live Supabase project — migration 0007 hasn't been applied anywhere
      live; see H4).
- [x] H2. Staff UI: kanban board by stage + enquiry detail. Board cards must
      surface event type, guest count, date, budget, and proposed venue(s)
      per enquiry — not just a bare stage/name list  [H1, D4]
      — `web/app/app/page.tsx` (the Pipeline Board itself, replacing the
      placeholder): columns per stage, cards pull event_type/guest_count/
      event_date/budget from each enquiry's latest brief. "Enquiry detail"
      half of this task was folded into G0's command center rather than
      a separate page. Browser-verified.
- [~] H3. (added 18 Jul — resolves the stage-model conflict documented in
      0000-foundation/erd.md §5.1) Auto-couple proposal send → enquiry
      stage transition: when a proposal's `status` flips to `sent` (G3's
      "Mark as sent"), call `POST /enquiries/{id}/transition` to
      `proposed` server-side instead of requiring two separate staff
      actions. Also add a status-rollup helper (Open/Awaiting/Won/Lost,
      computed from `stage`, never stored) for Pipeline Board grouping —
      no new column, no migration.  [G3, H1]
      — **Status-rollup shipped (18 Jul):** `stage_to_status()` in
      `stage_machine.py`, computed `status` field on every Enquiry
      response, `pipeline_status` filter on `GET /enquiries`, Pipeline
      Board summary pills. Auto-coupling proposal-send → transition still
      not done — tracked as the remaining open half of this task.
      **Decision made and executed (18 Jul, same day):** fuller workflow
      context supplied by the user confirmed the 5-stage Kanban (Enquiry →
      Briefed → Proposed → Held → Signed) as the actual intended pipeline,
      replacing (not just relabeling) this build's original 8 granular
      stages. Full revamp carried out same day: stage_machine.py's
      transition graph rewritten (13 unit tests), enquiry.py schema/
      routers updated, migration 0007 written (see H4), web/lib/api/
      types.ts + Pipeline Board updated, seed script rewritten for the
      new stage names. See H4 and 0000-foundation/erd.md §5.1 for the
      full account.
- [x] H4. (added 18 Jul, part of the H3 stage revamp) Migration
      `0007_enquiry_stage_revamp.py`: ALTER-only revision (new file, does
      not edit 0003 per the immutable-revision rule) that remaps existing
      rows from the 8 old stage values to the 5 new ones + lost, drops the
      old unnamed CHECK constraint via a dynamic `pg_constraint` lookup
      (not a hardcoded guessed name), adds an explicitly-named
      `enquiries_stage_check` CHECK with the 6 new values, and sets the
      column default to `'enquiry'`. Includes a documented (lossy)
      `downgrade()`.  [H1]
      — Written and reviewed, ruff clean. **Not yet applied to any live
      database** — no Supabase credentials available in this environment.
      Must be run via `alembic upgrade head` against the real project
      before the 5-stage code above or `scripts/seed_demo_enquiries.py`
      will work against live data.

## I. Verification
- [x] I1. Wire full suite into ci.yml (Vitest + pytest + golden set). CI runs
      `alembic upgrade head` against a clean test DB first — a revision that
      doesn't apply cleanly fails the build before any tests run.  [D3, F3]
      — the workflow file already existed from repo setup but had two
      real gaps that would have failed on first run, both fixed: (1) a
      plain `postgres:16` CI service has no `auth` schema, and every
      migration from 0001 on references `auth.users`/`auth.uid()` (only
      real in the live Supabase project) — added a "bootstrap minimal
      auth schema" step that stubs just enough (an `auth.users` table, a
      null-returning `auth.uid()`) for `alembic upgrade head` to apply
      cleanly; (2) `web/package.json` had no `typecheck` script even
      though ci.yml called `npm run typecheck` — added it, plus a
      `vitest.config.ts` (needed for Vitest to resolve the `@/*` path
      alias tsconfig already declares) since the web project had zero
      Vitest tests to actually exercise the runner. Added `web/lib/
      utils.ts` (extracted `slugify`/`toIsoDate`, previously duplicated
      three times across pages) + `utils.test.ts`, 5 tests. `OPENAI_API_KEY`
      wired through from `secrets.OPENAI_API_KEY` for the golden set (D3)
      — empty today, so it skips exactly like local dev, becomes
      load-bearing the moment the org secret is added.
      **Also fixed 30 ruff violations** surfacing across every Python
      file written this session (import sorting, `datetime.utcnow()` →
      `datetime.UTC`, unused import, line length) — `ruff check api/`
      was never actually run until now. Bumped line-length 100→110 first
      (a few long strings/decorators didn't need hard-wrapping to fit),
      hand-wrapped the 5 lines still over that. `ruff check api/`, the
      exact `pytest api/ -v` CI invocation, and both `npm run typecheck`/
      `npm run test --prefix web` commands all verified locally.
      **Not verified against actual GitHub Actions** — no way to run a
      real workflow from this environment; the auth-schema bootstrap in
      particular is reasoned through carefully but untested end-to-end
      in the real CI runner.
- [ ] I2. E2E: raw enquiry → sent proposal happy path  [G4, G5, H2]
- [ ] I3. /verify vs verification.md acceptance criteria; log verdict  [all]

## J. Client & Calendar (added 12 Jul — reflects PRD §10 page inventory update; NOT YET costed on Sprint Board, needs an hours decision)
- [x] J1. Staff UI: Client list + profile (read-only) at /app/clients + /app/clients/[id] —
      org/contact details plus chronological enquiry/proposal history, built entirely
      from existing contacts/organisations/enquiries/proposals tables. No new tables.  [C1]
      — no `contact_id`/enquiry-history filter existed on the list endpoints,
      so the profile page fetches all enquiries/proposals and filters
      client-side (fine at this data volume; revisit if it grows).
      Browser-verified (list loads, zero console errors).
- [x] J2. Staff UI: Calendar at /app/calendar — month/week view of venue_availability
      across the whole portfolio, booked and hold (with expiry) states shown side by
      side. Read-only; holds still created from Venue Profile.  [B6]
      — month view only (no week view). Same per-venue calendar pattern as
      B6, aggregated across all active venues, each entry linking back to
      its Venue Profile. Browser-verified by temporarily inserting a real
      availability window and confirming it rendered, then removing it.

---

**Notes on the mapping:** the 20-min pilot test and the "convert client's pricing Excel" work stay in the Sprint Board (human tasks — the Excel conversion feeds F1's *data*, F1 builds the *schema*). G4/G5 are the only Product-1 tasks blocked on the Tier-2 design gate — everything else proceeds on provisional tokens.

**Migrations are cut where the tables are first needed, not in group A (added 12 Jul).** A1 only creates profiles/user_roles (revision 0001) — the true cross-cutting dependency, since has_role() gates every RLS policy that comes after. B1, C1, D1, F1, and G1 each cut their own revision (0002–0006) as their first step. See 0000-foundation/erd.md §10 for the full revision map. Any schema change after a revision is merged — new column, widened field, extra enum value — is a **new** revision that ALTERs; the merged revision file is never hand-edited.

## Out-of-scope pages (explicit — setup guide §9)

- **No staff/user management page.** Adding, removing, or editing staff accounts is done directly via the Supabase dashboard, not built as an app screen.
- **No separate dashboard home.** The Pipeline Board (H2) *is* the landing page after login — don't build a redundant overview/stats page.
- **Pricing rules editor is a tab, not a page** — lives inside Venue Profile (F4/B4), never its own route.
- **New Enquiry is a modal, not a route** (C3) — keeps quick-entry fast.
