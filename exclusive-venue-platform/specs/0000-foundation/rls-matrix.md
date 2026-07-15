# RLS Matrix — Role × Table Access

*Derived from `erd.md` §7 (the ERD doc's summary matrix). This file is the full-policy expansion referenced from erd.md; flesh out each cell into the actual `CREATE POLICY` statement as each revision (see erd.md §10) is cut — the SQL lives with its migration, this file is the design record.*

## Summary matrix

| Table | anon (public) | staff/admin | landlord | supplier |
|---|---|---|---|---|
| venues | SELECT where status='active' | ALL | SELECT/UPDATE own; INSERT as pending_approval only; cannot self-activate | — |
| venue_media / venue_configurations / venue_availability / venue_restrictions | SELECT via active venue | ALL | ALL on own venue's rows | — |
| pricing_rules (+ pricing_rule_addons) | NO direct SELECT — quotes via engine RPC only | ALL | SELECT own venue's (no write) | — |
| contacts / organisations | INSERT via edge function only | ALL | — | — |
| enquiries / briefs | INSERT via edge function | ALL | — | — |
| proposals (+ proposal_venues, + proposal_suppliers) | SELECT via token RPC only | ALL | — | — |
| suppliers / supplier_media / supplier_tags | SELECT where active AND subscription active | ALL | — | SELECT/UPDATE own; cannot self-activate |
| supplier_subscriptions | — | ALL | — | SELECT own |
| profiles / user_roles | — | ALL | SELECT own | SELECT own |

## Ownership paths

- **Landlord**: every landlord-visible row traces to `venues.landlord_id`. No ownership path on a table = staff-only by default (erd.md §1.4).
- **Supplier**: every supplier-visible row traces to `suppliers.owner_user_id`.
- All policies gate through the `has_role(role)` helper against `user_roles` (erd.md §3) — never a role column check on `profiles`.

## Three deliberate hard lines (erd.md §7)

1. **anon never reads `pricing_rules`.** Even if a future decision allows live client-facing pricing, the public sees engine RPC output, never the underlying rules — those are EV's commercial IP. That's a policy tweak, not a schema change.
2. **Landlords cannot write pricing or self-activate venues.** Both are EV-controlled gates (`venues.status` transitions out of `pending_approval` require `approved_by`/`approved_at` set by staff).
3. **Suppliers cannot self-activate.** Visibility = EV approval (`suppliers.status='active'`) AND an active Stripe subscription (`supplier_subscriptions.status='active'`), enforced in the same policy — not two independent checks a client could partially satisfy.

## Per-revision policy checklist

Each Alembic revision that creates a table must include its RLS policies in the same revision (docs/stack-profile.md, constitution #8) — no separate upfront "RLS task". Before merging any revision, confirm:

- [ ] RLS is `ENABLE`d on every new table
- [ ] A policy exists for every role row in the summary matrix above, including explicit denial (no policy = no access, but verify the "—" cells actually resolve to no access, not an accidental ALL from a broader policy)
- [ ] Cross-tenant denial is testable (landlord A cannot see landlord B's venues; supplier A cannot see supplier B's subscription)
- [ ] anon policies match exactly what's in this matrix — no direct anon SELECT on `pricing_rules` or `proposals` under any circumstance

See the project security checklist (`.claude/agents/test-security.md`) — RLS cross-tenant denial tests run on every `/verify`.
