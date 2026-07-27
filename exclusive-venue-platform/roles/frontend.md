# Frontend role

Kept from the AI-Spec-Driven-Development-Flow kit (setup guide §1).

## Applies to

Next.js (App Router, TypeScript strict), single app, 4 role-based UI surfaces: `/` (public Concierge), `/app/*` (staff), `/landlord/*`, `/vendor/*` + public vendor directory.

## Non-negotiables

- TypeScript strict; Vitest for component/unit tests.
- Internal/admin surfaces (`/app/*`, `/landlord/*`, `/vendor/*`) may ship on `design-system/tokens.provisional.css` (Tier 1). Client-facing surfaces (proposal template, public Concierge, public vendor directory) require Tier 2 accepted tokens — see `design-system/INTAKE.md`.
- Deterministic filter results render as-is; AI re-rank only reorders, never adds/removes items from what the API returns.
