# Product Brief — Product 3: Landlord Portal

*Authored directly (no Notion PRD exists yet for this product) — decided in-session 2026-07-27, superseding the "Not yet populated" placeholder. Status: Draft · Build window: Week 6 onward, following Product 1/2 completion.*

## 1. Overview & Problem Statement

Venues on the platform are either EV-managed or owned by an external landlord (`venues.landlord_id`). Today every landlord-owned venue is entered and maintained entirely by EV staff on the landlord's behalf — the landlord has no direct visibility or control, even though the schema and RLS policies to support it (`venues_landlord_select_own`, `venues_landlord_update_own`, and the equivalent per-child-table policies) were already built in migrations `0002`/`0005`/`0017`–`0019`.

Product 3 gives landlords a self-service portal to manage their own venue listings and view/propose pricing, without changing who has final authority: staff still create the initial venue record, grant a landlord account access, and approve anything that affects what a client sees (activation, pricing).

## 2. Goals & Success Metric

**Primary goal:** a landlord, once invited, can independently keep their own venue's details, media, availability, and restrictions current — without needing a staff member to make the edit for them.

**Secondary goals:**
- Pricing stays deterministic and EV-authoritative even though landlords now have visibility and input — no exception to the constitution's trust boundary.
- Landlords have a place to record their own payout bank details, removing the current ad-hoc (email/spreadsheet) handling of that information.
- Staff/admin retain full, unrestricted visibility into every venue (landlord-owned or not) — Product 3 adds a new surface for landlords, it does not change what staff can already see on `/app/*`.

## 3. Users

- **Landlord (primary):** owns one or more venues, wants to keep listings accurate and get paid, has no interest in or access to platform-wide data.
- **Staff/admin (secondary, existing role, unchanged):** creates venues, invites landlords, assigns venue ownership, approves venue activation and pricing changes. No new staff-only page in this product beyond small additions to existing `/app/*` screens (invite action, pricing-request review).
