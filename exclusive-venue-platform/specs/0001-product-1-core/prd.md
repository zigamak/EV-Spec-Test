# PRD — Product 1: Internal Platform (Core)

*Pasted verbatim from Notion (setup guide §3.3 mapping: `prd.md` ← full Notion PRD). Status: Draft · Owner: Pentanitive · Build window: Weeks 1–5 (Jul 13 – Aug 16, 2026) · Milestone: M1.*

## 1. Overview & Problem Statement

Today, creating a venue proposal at Exclusive Venue takes roughly 20 minutes of manual work: pricing in Excel, copy-pasting descriptions, selecting visuals, and assembling a presentation document. Tracking each enquiry is scattered across email, WhatsApp, spreadsheets, and team calendars, so enquiries slip and follow-up is inconsistent.

Product 1 collapses that entire flow into a single system. An enquiry — however it arrives — becomes a structured brief, a set of recommended venues, and a fully-priced, branded proposal ready to send, in **under 20 minutes, without anyone opening Excel**. Every enquiry lives in one pipeline from first contact through to confirmation.

This is the headline deliverable of the engagement. Products 2–4 reuse the engines built here.

## 2. Goals & Success Metric

**Primary success metric:** A salesperson can go from a raw enquiry email to a sent, fully-priced, branded proposal in **under 20 minutes without touching Excel** — validated live with two pilot salespeople on real enquiries in Week 5.

**Secondary goals:**

- Every enquiry is captured in one pipeline, regardless of the channel it arrived through — no lost enquiries.
- Pricing is consistent and rule-based, not re-derived by hand each time.
- Proposals are on-brand and consistent across salespeople.

## 3. Users

- **Salesperson (primary):** receives enquiries, generates and sends proposals, manages their own pipeline of deals.
- **Ops / admin (secondary):** maintains the venue database and pricing rules, oversees all enquiries across the team.

## 4. Core User Flow

The spine of the product, end to end:

1. **Enquiry arrives** — by web form, manual entry, or a forwarded email to enquiries@.
2. **AI parses the enquiry** into a structured brief: date, guest count, event type, budget, location, specific requirements, contact details.
3. **Recommendation engine** surfaces the most suitable venues, filtered by capacity, availability, restrictions, and budget, then re-ranked for soft criteria (theme, vibe).
4. **Pricing engine** applies each venue's rules to produce a quote.
5. **Salesperson reviews and edits** the draft proposal — adjusting venue selection, pricing, and copy as needed.
6. **One-click proposal** is generated: branded, exported as PDF and as a tokenized shareable link.
7. **Enquiry is tracked** through pipeline stages from new through to confirmed.

*Diagrams (user flow, technical architecture) are attached to the Notion source page — see "PRD — Product 1: Internal Platform (Core)" for the rendered SVGs.*

## 5. Functional Requirements

**Venue database**
CRUD for venues with photo/video galleries, capacities per configuration, rules and restrictions as structured fields, an availability calendar, and pricing conditions stored as structured rule data (not free text).

**Enquiry intake**
Three intake paths: a public web form, manual entry by a salesperson, and inbound email parsing via a dedicated enquiries@ address forwarded to a webhook.

**AI brief parser**
A GPT call (OpenAI API) that converts an enquiry (email or free text) into a structured JSON brief. Every parse carries a confidence signal; low-confidence or ambiguous briefs are flagged for human review rather than passed silently downstream.

**Recommendation engine**
A deterministic filter (capacity, availability, restrictions, budget) produces a shortlist, which a GPT re-ranking pass then orders against soft criteria in the brief. The deterministic filter always runs first — the AI never invents availability or overrides a hard constraint.

> **Decision note (12 Jul):** a reference prototype (exclusive-venue-internal-ai-sales.netlify.app, status/ownership still unconfirmed — see Assets Tracker) shows manual-only venue selection with no AI ranking. This build keeps the AI re-rank as designed — a deliberate choice, not an oversight, made with the reference material in hand.

**Pricing engine**
Pure deterministic code driven by structured rule data: base rates, per-head tiers, duration multipliers, seasonal and day-of-week adjustments, and add-on services. Unit-tested against real historical quotes from the client's existing spreadsheets.

**Proposal builder**
Renders selected venues, computed pricing, and generated copy into a branded template. Fully editable by the salesperson before sending. Exports as a PDF and as a tokenized shareable link.

**CRM pipeline**
Enquiry stages (new → qualified → proposal sent → follow-up → visit → negotiation → confirmed) with salesperson assignment and a status board. The board surfaces the fields a salesperson actually needs at a glance per enquiry: event type, guest count, event date, budget, proposed venue(s), and current stage — not just a bare stage tracker. **Note:** "follow-up" and "visit" are status labels only in this build — no scheduling, reminders, or visit-logistics functionality is attached to them; that belongs to the deferred Phase 2 layer.

## 6. The AI-vs-Deterministic Boundary

This boundary is the trust backbone of the product and is non-negotiable. For a luxury brand, a price must never be "guessed" by a language model.

**Handled by AI (GPT):**

- Parsing enquiries into structured briefs
- Re-ranking the venue shortlist against soft criteria
- Drafting proposal copy

**Handled by deterministic code (never AI):**

- All pricing calculations
- Availability and capacity checks
- Any hard constraint or business rule

AI output is always a *suggestion a human can review*; deterministic output is *authoritative*. The pricing engine in particular takes zero AI input — it reads structured rules and computes, and its output must be reproducible and auditable.

## 7. Acceptance Criteria

The milestone (M1) is met when all of the following hold:

- Given a real enquiry email, the brief parser produces a correct structured brief, or flags it for human review when confidence is low — verified against the golden test set of 15–20 real enquiries.
- Given the same inputs as a historical quote, the pricing engine reproduces the client's own past quote (within rounding). Verified by unit tests built from real past quotes.
- The recommendation engine never returns a venue that fails a hard constraint (over capacity, unavailable, restricted).
- A salesperson can generate a branded proposal as both a PDF and a working shareable link.
- An enquiry can be moved through every pipeline stage and assigned to a salesperson.
- **The end-to-end flow (raw enquiry → sent proposal) is completed in under 20 minutes by two pilot salespeople on real enquiries, without using Excel.**

## 8. Out of Scope (Deferred to Post-Launch Backlog)

The following are explicitly **not** part of Product 1 in this engagement. They belong to the deferred Phase 2 (Ops & Marketing) layer and will be scoped as a separate follow-on:

- Task management, visit scheduling, contract/payment tracking, handover checklists
- Newsletter builder, audience segmentation, campaign sending, campaign personalisation
- Proposal and newsletter analytics, performance dashboards
- Centralised contact database management: deduplication tooling, subscription/unsubscription management, and communication history views (basic contact capture needed for enquiries IS in scope — it's the management layer on top that's deferred)
- Automatic conversion of public interactions (venue views, offer clicks) into follow-up tasks — depends on both the deferred analytics layer and the deferred task-automation layer
- Staff/user account management — adding, removing, or editing staff accounts is done directly via the Supabase dashboard, not a page in this app. No admin UI is built for this.

Note: the proposal builder here produces a tokenized shareable link, but *tracking* what happens on that link (opens, dwell time) is part of the deferred analytics layer, not this build.

## 9. Dependencies

Blocking items from the **Assets & Requirements Tracker**, with due dates:

- **Full venue portfolio data** (photos, capacity, availability) — due Jul 19 — feeds the venue database.
- **Documented and signed-off pricing rules** — due Jul 31 — feeds the pricing engine. Must be confirmed complete in writing.
- **Real sample enquiries + matching past proposals** — due Jul 19 — calibrates the brief parser and the golden test set.
- **Brand kit** (logo, fonts, colors) — due Jul 17 — feeds the proposal builder and design system.
- **Email inbox + forwarding for enquiries@** — due Jul 19 — enables the email intake path.
- **Legal boilerplate for proposals** (cancellation/payment/deposit terms) — due Jul 31 — appears on every generated proposal.
- **Two pilot salespeople identified** — due Aug 7 — for the Week 5 acceptance test.

## 10. Page Inventory

| Page | Route | Features | Detailed Description | Notes |
|---|---|---|---|---|
| Login | /app/login | Auth | Email/password sign-in via Supabase Auth. Redirects unauthenticated visitors here from any /app/* route. On success, redirects to the Pipeline Board. No self-registration — accounts are created via the Supabase dashboard only. | Every other route requires this first |
| Pipeline Board | /app | CRM Pipeline, Enquiry Board | Kanban-style board grouped by stage (new, qualified, proposal sent, follow-up, visit, negotiation, confirmed). Each card shows event type, guest count, date, budget, and proposed venue(s) at a glance. Click a card to open the Command Center. | This IS the dashboard home — no separate landing/overview page exists |
| New Enquiry | modal, not a route | Enquiry Intake | Slide-over form for enquiries received by phone or in person. Captures contact details and a free-text brief, run through the same AI parser as email/web-form enquiries. Closes back to the Pipeline Board on save. | Slide-over from Pipeline Board, kept fast on purpose |
| Enquiry Command Center | /app/enquiries/[id] | AI Parser, Recommendation, Pricing, Enquiry Board | The core working screen. Raw enquiry message alongside the editable AI-parsed brief with confidence indicator. Below: the recommended venue shortlist with live pricing per venue, updating as parameters change. One action generates a proposal from the selected venues. | The core screen; raw message + brief + venues + pricing together |
| Proposal Editor | same route, edit mode | Proposal Builder | Same route as Command Center, entered once venues are selected. Choose which venues go into the proposal, edit AI-drafted copy per venue, review the full branded layout before generating the final PDF and shareable link. | A mode within Command Center, not a separate page |
| Venue Library | /app/venues | Venue Database | Searchable, filterable grid of all venues (by capacity, location, type). Entry point for adding a new venue. Each card links to that venue's Profile. | Browse/search/filter |
| Venue Profile | /app/venues/[id] | Venue Database, Pricing Engine | Single venue's full record: photo/video gallery, capacity per layout, restrictions, availability calendar (including holds), and a Pricing Rules tab for base rate, per-head tiers, and seasonal multipliers. | Gallery, capacity, restrictions, availability; pricing rules as a tab here |
| Client | /app/clients + /app/clients/[id] | Contact/Organisation records | A read-only profile per contact/organisation: basic details plus a chronological history of their enquiries and proposals, pulled from existing data — no new tables required. Deliberately lighter than a full CRM: no deduplication tooling, segments, or subscription management, which stay deferred to Phase 2. | NEW (12 Jul) — not yet reflected in Sprint Board hours |
| Calendar | /app/calendar | Venue Database (availability) | Month/week view of venue availability across the whole portfolio — confirmed bookings and soft holds (with expiry) shown side by side. Read-only; holds are still created from the Venue Profile's availability tab, not directly on this calendar. | NEW (12 Jul) — not yet reflected in Sprint Board hours |
| Public Proposal Link | /p/[token] | Proposal Builder output | What the client actually opens. Unauthenticated, read-only, branded to match Exclusive Venue. Shows the curated venue options, itemized pricing, and a call-to-action to respond. Outside the staff app entirely. | Unauthenticated, client-facing, outside /app/* entirely |
