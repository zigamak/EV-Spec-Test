# Remaining Features Backlog — Product 1 (Internal AI-Powered Commercial, Marketing & Operations Platform)

Gap analysis against the Product 1 brief, checked directly against the codebase (routers, migrations, schemas) rather than assumed — current as of **2026-07-25**. Not the PM/schedule truth (see `CLAUDE.md` and `memory/constitution.md` §7) — the Notion Sprint Board is; treat this as an engineering-side reference to decompose into Sprint Board rows / `tasks.md`, not a replacement for either.

## What's already delivered (for context — not the subject of this doc)

Enquiry intake (manual + web form; email webhook coded but untested live), venue database, AI brief parser, recommendation engine, automated pricing engine, one-click branded proposal builder with PDF export + shareable link, sales CRM (Pipeline board, Inbox, Contacts directory), enquiry stage pipeline, role-based access (admin vs. salesperson), append-only activity log, and a performance dashboard (KPIs, funnel, channel mix, upcoming bookings, aging pipeline, lost reasons, proposal-status breakdown, revenue trend, team leaderboard, venue performance, team workload — admin/staff scoped). Proposal analytics (client opens, per-venue "seen" tracking) shipped 25 Jul.

## Tier 1 — buildable now, no new external infrastructure

Straightforward CRUD following patterns already established elsewhere in this codebase (pricing rules, briefs, venues). No new integrations required.

| Feature | Brief reference | Notes |
|---|---|---|
| Lightweight task / action items | "Asana-style project management" | Not full Asana parity — a real `tasks` table (title, enquiry_id, owner, due_date, done) + a list on the enquiry detail page. Covers "owners, deadlines" from the brief; not comments/attachments/full history in v1. |
| Handover checklist | "Handover management" | Fixed or simple custom checklist tied to signed enquiries, sales → ops → venue manager sign-off. |
| Financial tracking as a ledger | "Contract and financial tracking" | Recording deposits/payments/commissions that happened elsewhere (bank transfer, etc.) against a booking. This is bookkeeping/tracking, **not** payment processing — an actual payment gateway (Stripe or similar) is a separate, much larger undertaking not scoped here. |
| Contact segmentation surfaced | "Smart audience segmentation" | `OrganisationKind` (corporate/agency/brand/production_house) and `OrganisationTier` (tier-1/tier-2/standard) already exist as real columns on `organisations` — currently unused by any feature. A filterable "build a target list" view in Contacts is mostly a UI layer over data that already exists. |

## Tier 2 — buildable now, larger scope, still no new external infrastructure

| Feature | Brief reference | Notes |
|---|---|---|
| Site visit management | "Visit management" | New schema (visit date, attendees, status, notes, post-visit feedback) + a real UI, similar shape to the existing Calendar page. In-app reminders (e.g. a dashboard "visits this week" card) are easy; anything emailed to a client depends on Tier 3 below. |

## Tier 3 — blocked until outbound email exists

**There is currently no outbound email-sending capability anywhere in this codebase** — only inbound (Resend's inbound-parse webhook, for receiving enquiries as they arrive). `proposals.personal_email_copy` is AI-drafted text stored for a human to copy-paste and send themselves; nothing has ever called an email-send API. This is the real blocker for everything in this tier.

| Feature | Brief reference | Notes |
|---|---|---|
| Automated client follow-up / delay alerts (emailed) | "Task and follow-up automation" | Needs Resend's *send* API (or equivalent) wired up first. The dashboard's aging-pipeline card is a passive read today, not automation that pushes anything to anyone. |
| Newsletter / campaign module | "Newsletter creation and sending module", "Campaign personalisation", "Send scheduling and automation" | Needs outbound sending + template rendering + a scheduler/cron for sends. This is genuinely its own project, not an add-on to Product 1 — recommend scoping and estimating it separately. |
| Newsletter analytics | "Newsletter analytics" | Entirely downstream of the module above — nothing to measure until it exists. |
| Interaction → CRM auto-conversion | "Conversion of interactions into commercial opportunities" | Depends on newsletters/tracked campaign links existing first. |

## Suggested sequencing

1. Proposal analytics — **done** (25 Jul).
2. Site visit management or lightweight tasks — whichever is costing the most in email/WhatsApp/spreadsheet fragmentation right now.
3. Handover checklist, financial ledger, contact segmentation UI — smaller, can slot in around the above.
4. Newsletter/marketing module — plan and scope as its own initiative once outbound email is a deliberate decision (provider, deliverability, unsubscribe handling), not a side effect of another task.
