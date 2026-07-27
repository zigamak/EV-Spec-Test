# specs/

One folder per **product**, not per feature (setup guide §1 rationale: per-feature granularity across 4 products would produce 50+ documents of ceremony inside a 190-hour budget).

- `0000-foundation/` — cross-product artifacts that live ONCE: schema (`erd.md`), RLS matrix, route architecture, shared API contracts (parser / recommender / pricing engines). Product folders reference this, never redefine it. A schema change starts here, then propagates as a new Alembic revision.
- `0001-product-1-core/` — Product 1: Internal Platform (Core). Populate first; build window Weeks 1–5.
- `0002-ai-concierge/`, `0003-landlord-portal/`, `0004-vendor-marketplace/` — populate the week before that product's build starts (Weeks 5–6), same order as the Sprint Board. Do not populate all four on day 1.

Each product folder follows the same shape: `product-brief.md`, `prd.md`, `design-system.md`, `plan.md`, `team.md`, `tasks.md`, `verification.md`. Scaffold a new one with `scripts/new-feature.sh <NNNN-slug>`.

Do NOT run `/discover` or `/specify` generatively — paste the Notion PRDs into `prd.md` / `product-brief.md` instead.
