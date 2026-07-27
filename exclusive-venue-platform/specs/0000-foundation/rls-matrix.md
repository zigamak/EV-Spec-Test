# RLS Matrix — Role × Table Access

*Derived from `erd.md` §7 (the ERD doc's summary matrix). This file is the full-policy expansion referenced from erd.md; flesh out each cell into the actual `CREATE POLICY` statement as each revision (see erd.md §10) is cut — the SQL lives with its migration, this file is the design record.*

## Summary matrix

| Table | anon (public) | staff/admin | landlord | vendor |
|---|---|---|---|---|
| venues | SELECT where status='active' | ALL | SELECT/UPDATE own; INSERT as pending_approval only; cannot self-activate | — |
| venue_media / venue_configurations / venue_availability / venue_restrictions | SELECT via active venue | ALL | ALL on own venue's rows | — |
| pricing_rules (+ pricing_rule_addons) | NO direct SELECT — quotes via engine RPC only | ALL | SELECT own venue's (no write) | — |
| contacts / organisations | INSERT via edge function only | ALL | — | — |
| enquiries / briefs | INSERT via edge function | ALL | — | — |
| proposals (+ proposal_venues, + proposal_vendors) | SELECT via token RPC only | ALL | — | — |
| vendors / vendor_media / vendor_tags | SELECT where active AND subscription active | ALL | — | SELECT/UPDATE own; cannot self-activate |
| vendor_subscriptions | — | ALL | — | SELECT own |
| profiles / user_roles | — | ALL | SELECT own | SELECT own |
| currencies | SELECT (public reference data) | ALL | SELECT | SELECT |
| landlord_payment_accounts | — | ALL | SELECT/UPDATE own | — |
| pricing_rule_change_requests | — | ALL | SELECT/INSERT own venue's (no self-approve — UPDATE of `status` is staff-only) | — |
| landlord_invites | — | ALL | — | — |
| vendor_services | SELECT where vendor active + subscribed | ALL | — | SELECT/UPDATE own |
| payment_methods | SELECT (public reference data) | ALL | — | SELECT |
| commission_rules | — | ALL | — | SELECT own override + platform default (no other vendor's rate) |
| coupons | NO direct SELECT — validated/applied via RPC only | ALL | — | SELECT/INSERT own vendor-scoped coupons |
| orders | INSERT via edge function only (guest checkout) | ALL | — | SELECT own (via vendor_id) |
| payments | — | ALL | — | SELECT own (via order→vendor_id) |
| vendor_payment_accounts | — | ALL (masked except own edit context) | — | SELECT/UPDATE own |
| payouts | — | ALL | — | SELECT own |

## Ownership paths

- **Landlord**: every landlord-visible row traces to `venues.landlord_id`, or directly to `landlord_id`/`proposed_by` on the Product 3 tables added in erd.md §6a. No ownership path on a table = staff-only by default (erd.md §1.4).
- **Vendor**: every vendor-visible row traces to `vendors.owner_user_id`, or directly (`vendor_id`) on the Product 4 marketplace-transaction tables added in erd.md §6b (`vendor_services`, `commission_rules`, `orders`, `payments` — via `orders.vendor_id`, `vendor_payment_accounts`, `payouts`).
- **Customer** (new role, Product 4): an `orders` row where `customer_user_id = auth.uid()` — optional, since guest checkout (no account) is the default path; a guest order has no `user_roles`-gated access at all beyond what a tokenized link (mirroring `proposal_link_tokens`) might later provide.
- All policies gate through the `has_role(role)` helper against `user_roles` (erd.md §3) — never a role column check on `profiles`.

## Three deliberate hard lines (erd.md §7)

1. **anon never reads `pricing_rules`** (or, by the same logic, `coupons`). Even if a future decision allows live client-facing pricing, the public sees engine/RPC output, never the underlying rules — pricing rules are EV's commercial IP, and a full coupon list would let anyone browse every active discount code. Both are policy tweaks at most, never a schema change.
2. **Landlords cannot write pricing or self-activate venues.** Both are EV-controlled gates (`venues.status` transitions out of `pending_approval` require `approved_by`/`approved_at` set by staff). A landlord's pricing input goes through `pricing_rule_change_requests` (INSERT own, cannot set `status='approved'` themselves) — never a direct write to `pricing_rules`.
3. **Vendors cannot self-activate.** Visibility = EV approval (`vendors.status='active'`) AND an active Stripe subscription (`vendor_subscriptions.status='active'`), enforced in the same policy — not two independent checks a client could partially satisfy.

## Per-revision policy checklist

Each Alembic revision that creates a table must include its RLS policies in the same revision (docs/stack-profile.md, constitution #8) — no separate upfront "RLS task". Before merging any revision, confirm:

- [ ] RLS is `ENABLE`d on every new table
- [ ] A policy exists for every role row in the summary matrix above, including explicit denial (no policy = no access, but verify the "—" cells actually resolve to no access, not an accidental ALL from a broader policy)
- [ ] Cross-tenant denial is testable (landlord A cannot see landlord B's venues; vendor A cannot see vendor B's subscription)
- [ ] anon policies match exactly what's in this matrix — no direct anon SELECT on `pricing_rules` or `proposals` under any circumstance

See the project security checklist (`.claude/agents/test-security.md`) — RLS cross-tenant denial tests run on every `/verify`.
