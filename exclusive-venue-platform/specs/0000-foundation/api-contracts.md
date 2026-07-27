# API Contracts — Shared Engines

*PLACEHOLDER — this is the output of the Week 2 Sprint Board task "Write API Contract — Shared AI/Pricing Engines" (setup guide §2 step 9, §3.5). Not yet run. Fill in once `/plan` for Product 1 completes and the shared engine boundaries are finalized.*

## Scope

The three engines shared across products, per the AI-vs-deterministic trust boundary (memory/constitution.md #1):

1. **Parser** — enquiry text → structured brief JSON (D1). GPT tool-calling call (OpenAI API); output validated against the `briefs` schema (erd.md §5) before persisting; carries `confidence` + `review_status`.
2. **Recommender** — deterministic filter (E1: capacity + availability + restrictions + budget) → shortlist, then GPT re-rank (E2) against soft criteria. The filter always runs first; the AI never adds, removes, or invents an item — it only reorders what E1 returns.
3. **Pricing** — pure deterministic function over `(venue pricing_rules × brief)` → quote breakdown (F2). Zero AI/LLM calls anywhere in this call path (test-security checklist, setup guide §6).

## To be specified here

- Request/response JSON shapes for each engine (internal function signatures if called in-process from FastAPI, or endpoint contracts if exposed as internal API routes).
- Error/failure modes: low-confidence parse → `needs_review`; empty shortlist after E1; pricing rule not found for a venue/date.
- Versioning: which `pricing_rules` row a quote pins (`effective_from`/`effective_to`), which `briefs` version a proposal pins (`proposal.brief_id`) — both per erd.md §5.
- Consumers: Product 1 (primary), Product 2 Concierge (reuses parser + recommender + pricing, read-only path), Product 3/4 (venue and vendor data only, no engine calls).

Populate this file from the `/plan` output for `specs/0001-product-1-core/` once it references `erd.md` — see setup guide §2 step 9.
