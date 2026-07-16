# API Reference — Exclusive Venue Platform (Product 1 Core)

Auto-generated reference of every FastAPI endpoint built so far. Base URL locally: `http://localhost:8000`. Source: `api/app/routers/*.py`.

**Auth model**: unless marked *Public*, every endpoint requires `Authorization: Bearer <supabase-access-token>`. The token only proves *who* is calling (`require_staff_session` in `api/app/core/auth.py`) — *what* that person can see or write is decided entirely by Postgres Row-Level Security policies on the underlying tables, not by application code. "Staff" in the tables below means any authenticated user; RLS then narrows the result set per role (staff/admin see everything, landlords see only their own venues, etc.).

---

## Venues (`api/app/routers/venues.py`)

Prefix: `/venues`

| Method | Path | Function | What it does |
|---|---|---|---|
| GET | `/venues` | `list_venues` | List venues, optional `status_filter` query param (draft/pending_approval/active/inactive). |
| GET | `/venues/portfolio-availability` | `list_venues_with_availability` | Same as `/venues` but embeds each venue's availability windows in the same query (`select=*,availability:venue_availability(*)`) — added 16 Jul so the Calendar page fetches every venue's holds/bookings in one round trip instead of looping per venue. Must stay declared before `/{venue_id}` (FastAPI route-matching order). |
| GET | `/venues/portfolio` | `list_venues_with_portfolio` | Same as `/venues` but embeds each venue's media (with signed URLs) and configurations in the same query — added 16 Jul so the Venue Library page fetches everything in one round trip instead of two calls per venue. Must also stay declared before `/{venue_id}`. |
| GET | `/venues/{venue_id}` | `get_venue` | Fetch one venue. 404 if not found or not visible under RLS. |
| POST | `/venues` | `create_venue` | Create a venue. Landlords can only create their own (`landlord_id = self`, forced to `pending_approval`); staff can create any. |
| PATCH | `/venues/{venue_id}` | `update_venue` | Update venue fields. RLS blocks a landlord from setting `status` to anything but draft/pending_approval on their own venue. |
| POST | `/venues/{venue_id}/approve` | `approve_venue` | Flips status to `active`, stamps `approved_by`/`approved_at`. Staff-only in practice — RLS's landlord policy only permits draft/pending_approval, so a landlord calling this always gets 404, never a silent self-activation. |
| DELETE | `/venues/{venue_id}` | `delete_venue` | Delete a venue. Blocked (409-style FK error) if the venue has ever appeared in a proposal (`proposal_venues` uses `ON DELETE RESTRICT`). |
| GET | `/venues/{venue_id}/configurations` | `list_configurations` | List a venue's layout/capacity configurations. |
| POST | `/venues/{venue_id}/configurations` | `create_configuration` | Add a configuration (name + capacity + notes). |
| PATCH | `/venues/{venue_id}/configurations/{configuration_id}` | `update_configuration` | Edit a configuration. |
| DELETE | `/venues/{venue_id}/configurations/{configuration_id}` | `delete_configuration` | Remove a configuration. |
| GET | `/venues/{venue_id}/restrictions` | `list_restrictions` | List structured restrictions (no_smoking, curfew, etc.), each flagged hard/soft. |
| POST | `/venues/{venue_id}/restrictions` | `create_restriction` | Add a restriction. |
| PATCH | `/venues/{venue_id}/restrictions/{restriction_id}` | `update_restriction` | Edit a restriction. |
| DELETE | `/venues/{venue_id}/restrictions/{restriction_id}` | `delete_restriction` | Remove a restriction. |
| GET | `/venues/{venue_id}/availability` | `list_availability` | List booked/hold/maintenance windows. |
| POST | `/venues/{venue_id}/availability` | `create_availability` | Add a window. A `hold` reason requires `hold_expires_at` (DB CHECK constraint enforces this). |
| DELETE | `/venues/{venue_id}/availability/{availability_id}` | `delete_availability` | Cancel/remove a window. |

## Venue Media (`api/app/routers/venue_media.py`)

Prefix: `/venues`

| Method | Path | Function | What it does |
|---|---|---|---|
| GET | `/venues/{venue_id}/media` | `list_media` | List photos/videos/floor plans, each with a fresh 1-hour signed URL. |
| POST | `/venues/{venue_id}/media` | `upload_media` | Multipart upload (max 20MB). Inserts the DB row via the caller's RLS-scoped session *first*; only writes the file to the private Supabase Storage bucket after that insert is authorized — a denied DB write never leaves an orphaned file. Rolls back the row if the storage write then fails. |
| PATCH | `/venues/{venue_id}/media/{media_id}` | `update_media` | Edit caption/kind/sort_order. |
| DELETE | `/venues/{venue_id}/media/{media_id}` | `delete_media` | Deletes both the DB row and the underlying storage object. |

## Pricing Rules (`api/app/routers/pricing.py`)

Prefix: `/venues/{venue_id}/pricing-rules` — deterministic only, zero AI anywhere in this router.

| Method | Path | Function | What it does |
|---|---|---|---|
| GET | `/venues/{venue_id}/pricing-rules` | `list_pricing_rules` | List all rule versions for a venue, newest `effective_from` first. |
| GET | `/venues/{venue_id}/pricing-rules/active?on_date=` | `get_active_pricing_rule` | Resolve whichever rule version is in effect on a given date. |
| POST | `/venues/{venue_id}/pricing-rules` | `create_pricing_rule` | Create a rule version: base rate, per-head tiers, duration multipliers, day/season adjustments, min spend, `effective_from`/`effective_to`. |
| GET | `/venues/{venue_id}/pricing-rules/{rule_id}` | `get_pricing_rule` | Fetch one rule version. |
| PATCH | `/venues/{venue_id}/pricing-rules/{rule_id}` | `update_pricing_rule` | Edit a rule version. |
| DELETE | `/venues/{venue_id}/pricing-rules/{rule_id}` | `delete_pricing_rule` | Delete a rule version. |
| GET | `/venues/{venue_id}/pricing-rules/{rule_id}/addons` | `list_addons` | List add-ons (flat/per-head/per-hour) attached to a rule. |
| POST | `/venues/{venue_id}/pricing-rules/{rule_id}/addons` | `create_addon` | Add an add-on. |
| PATCH | `/venues/{venue_id}/pricing-rules/{rule_id}/addons/{addon_id}` | `update_addon` | Edit an add-on. |
| DELETE | `/venues/{venue_id}/pricing-rules/{rule_id}/addons/{addon_id}` | `delete_addon` | Remove an add-on. |
| POST | `/venues/{venue_id}/pricing-rules/{rule_id}/quote` | `quote` | **The pricing engine itself.** Given guest count, event date, duration, and selected add-on ids, returns a full deterministic `QuoteBreakdown` (base rate → per-head total → day/season multipliers → duration overtime → add-ons → min-spend floor → total). Pure function underneath (`app/services/pricing_engine.py`), unit-tested (17 tests). |

## Enquiries, Contacts & Organisations (`api/app/routers/enquiries.py`)

No prefix (routes are `/organisations`, `/contacts`, `/enquiries`).

| Method | Path | Function | What it does |
|---|---|---|---|
| GET | `/organisations` | `list_organisations` | List organisations, optional `search` (name, ILIKE). |
| POST | `/organisations` | `create_organisation` | Create an organisation (name + kind). |
| GET | `/organisations/{organisation_id}` | `get_organisation` | Fetch one. |
| PATCH | `/organisations/{organisation_id}` | `update_organisation` | Edit one. |
| GET | `/contacts` | `list_contacts` | List contacts, optional `search` (name or email). |
| POST | `/contacts` | `create_contact` | Create a contact (name, email, phone, org, source). |
| GET | `/contacts/{contact_id}` | `get_contact` | Fetch one. |
| PATCH | `/contacts/{contact_id}` | `update_contact` | Edit one. |
| GET | `/enquiries` | `list_enquiries` | List enquiries, optional `stage`/`assigned_to` filters. Embeds every brief version per enquiry (`select=*,briefs(*)`) — added 16 Jul so the Pipeline Board and Calendar pages get each enquiry's briefs in one round trip instead of one `GET .../briefs` per enquiry. Callers pick the highest `version` themselves. |
| POST | `/enquiries` | `create_enquiry` | Create an enquiry (staff manual-entry path — always stamps `created_by`; anonymous intake is a separate service-role path, see Webhooks below). |
| GET | `/enquiries/{enquiry_id}` | `get_enquiry` | Fetch one. |
| PATCH | `/enquiries/{enquiry_id}` | `update_enquiry` | Edit `contact_id`/`lost_reason` only — **`stage` is deliberately excluded** here, forcing every stage change through the transition endpoint below. |
| POST | `/enquiries/{enquiry_id}/transition` | `transition_enquiry` | The stage-machine endpoint (`app/services/stage_machine.py`). Validates the move against a fixed transition graph (e.g. `new`→`confirmed` is rejected, 409); moving to `lost` requires a `lost_reason` (422 otherwise). |
| POST | `/enquiries/{enquiry_id}/assign` | `assign_enquiry` | Assign (or unassign, `null`) a staff member to an enquiry. |

## AI Brief Parser (`api/app/routers/briefs.py`)

Prefix: `/enquiries/{enquiry_id}/briefs`

| Method | Path | Function | What it does |
|---|---|---|---|
| GET | `/enquiries/{enquiry_id}/briefs` | `list_briefs` | List every parsed version of this enquiry's brief, newest first. |
| POST | `/enquiries/{enquiry_id}/briefs/parse` | `parse_brief` | Calls the AI (tool-calling, `app/services/brief_parser.py`, provider chosen by `AI_PROVIDER` — see `app/core/llm.py`) to turn the enquiry's raw text into a structured brief (date, guests, budget, event type, requirements). Stores a deterministic confidence-based `review_status` (`auto_accepted` ≥ 0.75, else `needs_review`) — never trusts the model's output as final. Returns **503** if the active provider's API key isn't configured, **502** if the call itself fails. |
| GET | `/enquiries/{enquiry_id}/briefs/{brief_id}` | `get_brief` | Fetch one version. |
| PATCH | `/enquiries/{enquiry_id}/briefs/{brief_id}` | `update_brief` | Human review/correction. Editing any field sets `review_status=human_corrected`; a bare approval with no field changes sets `human_approved`. Always stamps `reviewed_by`. |

## Recommendation Engine (`api/app/routers/recommendations.py`)

Prefix: `/briefs/{brief_id}/shortlist`

| Method | Path | Function | What it does |
|---|---|---|---|
| GET | `/briefs/{brief_id}/shortlist?rerank=` | `get_shortlist` | **The deterministic filter (E1)**: loads every active venue, excludes anything over capacity, unavailable on the brief's date, hard-restriction-conflicting, or (with a 15% tolerance) over budget — returns a priced shortlist plus the excluded venues with reasons. If `rerank=true`, asks the AI (E2, `app/services/recommendation_engine.py`) to reorder the shortlist by soft criteria; the AI can **only** reorder — if its response doesn't contain exactly the input venue ids, the original deterministic order is kept instead. Returns 503/502 the same way as the parser if the provider is unavailable/fails. |

## Proposals (`api/app/routers/proposals.py`)

No prefix (routes are `/proposals/...`).

| Method | Path | Function | What it does |
|---|---|---|---|
| GET | `/proposals` | `list_proposals` | List proposals, optional `enquiry_id` filter. |
| POST | `/proposals` | `create_proposal` | Create a proposal (pins a specific `brief_id` version + `enquiry_id`). |
| GET | `/proposals/{proposal_id}` | `get_proposal` | Fetch one. |
| PATCH | `/proposals/{proposal_id}` | `update_proposal` | Edit title/intro_copy/legal_boilerplate/status. |
| POST | `/proposals/{proposal_id}/send` | `send_proposal` | Marks `status=sent`, stamps `sent_at`. |
| POST | `/proposals/{proposal_id}/generate-intro-copy` | `generate_proposal_intro_copy` | AI-drafted intro paragraph (plain completion, not tool-calling) from the brief + client org name. Writes straight into the ordinary editable `intro_copy` column — never authoritative, always rewritable. 503/502 on missing key/call failure. |
| GET | `/proposals/{proposal_id}/venues` | `list_proposal_venues` | List the venues included in a proposal, in sort order. |
| POST | `/proposals/{proposal_id}/venues` | `add_proposal_venue` | Attach a venue + configuration + pricing rule + a computed quote breakdown to the proposal. |
| PATCH | `/proposals/{proposal_id}/venues/{proposal_venue_id}` | `update_proposal_venue` | Edit `venue_copy`/`sort_order`/`recommended`. |
| POST | `/proposals/{proposal_id}/venues/{proposal_venue_id}/generate-copy` | `generate_proposal_venue_copy` | AI-drafted per-venue sales copy, same non-authoritative pattern as intro copy. |
| DELETE | `/proposals/{proposal_id}/venues/{proposal_venue_id}` | `remove_proposal_venue` | Drop a venue from the proposal. |
| GET | `/proposals/{proposal_id}/links` | `list_links` | List shareable link tokens for a proposal. |
| POST | `/proposals/{proposal_id}/links` | `create_link` | Mint a new tokenized shareable link (43-char URL-safe token, 30-day default expiry). |
| POST | `/proposals/{proposal_id}/links/{token_id}/revoke` | `revoke_link` | Revoke a link immediately. |

## Public Proposal Reader (`api/app/routers/public_proposals.py`)

Prefix: `/public/proposals` — **Public, no auth required.**

| Method | Path | Function | What it does |
|---|---|---|---|
| GET | `/public/proposals/{token}` | `get_public_proposal` | The only way an unauthenticated client ever reads a proposal. Uses the service-role client (bypasses RLS) but only *after* validating the token exists, isn't revoked (410 if so), and isn't expired (410 if so) — plays the role a Supabase Edge Function would in a pure-Supabase stack. Returns a narrowed view: no internal ids, no `pricing_rules_id`, nothing beyond what a client should see of their own proposal. |

## Inbound Webhooks (`api/app/routers/webhooks.py`)

Prefix: `/webhooks` — **Public, no auth required** (called by Resend's servers, not a user).

| Method | Path | Function | What it does |
|---|---|---|---|
| POST | `/webhooks/resend/inbound-email` | `resend_inbound_email` | Turns an inbound email at `enquiries@` into a raw enquiry record. Verifies the Svix-style HMAC signature (`app/services/webhook_verification.py`) before trusting a single byte — fails closed: 503 if `RESEND_WEBHOOK_SECRET` isn't configured, 401 on a missing/invalid/stale signature. On success, finds-or-creates a contact by sender email, then inserts the enquiry via the service-role client. Always acks unrecognized event types with 200 rather than erroring, so Resend doesn't retry-storm an event this endpoint doesn't act on. |

---

## Cross-cutting pieces (not endpoints, but load-bearing)

| Module | Purpose |
|---|---|
| `api/app/core/scoped_client.py` | Builds a Supabase client scoped to the caller's own JWT for every authenticated request — RLS on the DB is what actually authorizes each read/write, not this module. |
| `api/app/core/admin_client.py` | Service-role client, used only where the request has no user session to scope to (public proposal reader, inbound webhook) — the same role a Supabase Edge Function would play. |
| `api/app/core/llm.py` | **Provider-agnostic AI client.** `AI_PROVIDER` env var (`openai`/`anthropic`/`gemini`) selects the adapter; `brief_parser.py`/`recommendation_engine.py`/`copy_generator.py` only ever call `get_llm_client().call_tool(...)` or `.generate_text(...)` — none of them import a provider SDK or know which one is active. Switching providers is a config change, not a code change. |
| `api/app/services/pricing_engine.py` | The actual pricing calculator — pure function, zero AI, unit tested. |
| `api/app/services/recommendation_engine.py` | The deterministic filter (E1) + AI re-rank (E2), with the "AI can only reorder" guarantee enforced in code. |
| `api/app/services/brief_parser.py` | Tool-calling schema + call for turning raw enquiry text into a structured brief. |
| `api/app/services/copy_generator.py` | Plain-completion calls for proposal intro/venue copy. |
| `api/app/services/stage_machine.py` | The enquiry pipeline's deterministic stage-transition graph. |
| `api/app/services/webhook_verification.py` | Svix-scheme HMAC signature verification for inbound webhooks. |
| `api/app/services/proposal_links.py` | Shareable-link token generation + default expiry. |

**Full endpoint count: 67** across 9 routers (65 authenticated + 1 public read + 1 public webhook), plus an unauthenticated `GET /health` check in `api/app/main.py`.
