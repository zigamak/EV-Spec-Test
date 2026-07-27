# 0004 — Vendor Marketplace (Product 4)

Not yet populated — per setup guide §2 ("Do NOT populate all four product folders on day 1; fill each the week before its build, same order as the Sprint Board"). Scheduled for Week 6.

When it's time: paste the matching Notion PRD into `prd.md` / `product-brief.md`, fill `team.md`, then run `/plan` referencing `specs/0000-foundation/erd.md`.

This product is the `/vendor/*` surface + public vendor directory. Cuts its own Alembic revision for vendors, vendor_media, vendor_tags, vendor_subscriptions, proposal_vendors (erd.md §6, §10). Stripe webhook signature verification is required (test-security checklist, setup guide §6) — `vendor_subscriptions` mirrors Stripe state, Stripe is the source of truth.
