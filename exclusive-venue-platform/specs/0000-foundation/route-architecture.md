# Route / Middleware Architecture — 4 UI Surfaces

*PLACEHOLDER — this file is the output of the Sprint Board task "Design route/middleware architecture for 4 UI surfaces" (setup guide §3.5), not yet run as a standalone deliverable. Populated below with what's already fixed by the Product 1 PRD (page inventory, §10) and the stack profile's routing scheme; extend as Products 2–4 route inventories land (Weeks 5–6).*

## Role-based routing (from docs/stack-profile.md)

Single Next.js app, 4 surfaces via role-based routing:

- `/` — public Concierge (Product 2, unauthenticated)
- `/app/*` — staff (Product 1)
- `/landlord/*` — landlord portal (Product 3)
- `/supplier/*` + public supplier directory (Product 4)

## Product 1 route inventory (confirmed — PRD §10)

| Route | Page | Auth |
|---|---|---|
| `/app/login` | Login | Public (redirect target for unauthenticated `/app/*`) |
| `/app` | Pipeline Board — the dashboard home; no separate overview page | staff |
| modal (no route) | New Enquiry — slide-over from Pipeline Board | staff |
| `/app/enquiries/[id]` | Enquiry Command Center (+ Proposal Editor as a mode within it) | staff |
| `/app/venues` | Venue Library | staff |
| `/app/venues/[id]` | Venue Profile (pricing rules editor lives as a tab here) | staff |
| `/app/clients`, `/app/clients/[id]` | Client list / profile (read-only) | staff |
| `/app/calendar` | Calendar (read-only; holds created from Venue Profile) | staff |
| `/p/[token]` | Public Proposal Link — outside `/app/*` entirely, unauthenticated | public |

## Middleware

- `/app/*`, `/landlord/*`, `/supplier/*` require a valid Supabase Auth session; unauthenticated requests redirect to the matching login route.
- Role gate on top of auth: `/app/*` requires `has_role('staff')` or `has_role('admin')`; `/landlord/*` requires `has_role('landlord')`; `/supplier/*` requires `has_role('supplier')`. A user without the matching role gets redirected, not a 403 page — avoids leaking route existence.
- `/` (Concierge) and `/p/[token]` never require auth; `/p/[token]` reads via RPC/edge function only (no direct client read of `proposals`, per rls-matrix.md).
- No self-registration anywhere — accounts are created via the Supabase dashboard only (PRD §10, out-of-scope §9).

## Pending (populate Weeks 5–6, per product build order)

- `/` Concierge page inventory — Product 2 (Week 5)
- `/landlord/*` page inventory — Product 3 (Week 6)
- `/supplier/*` + public supplier directory page inventory — Product 4 (Week 6)
