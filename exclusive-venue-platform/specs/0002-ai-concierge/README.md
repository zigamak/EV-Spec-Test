# 0002 — AI Concierge (Product 2)

Not yet populated — per setup guide §2 ("Do NOT populate all four product folders on day 1; fill each the week before its build, same order as the Sprint Board"). Scheduled for Week 5.

When it's time: run `scripts/new-feature.sh 0002-ai-concierge` is not needed (folder already exists) — instead paste the matching Notion PRD into `prd.md` / `product-brief.md`, fill `team.md` (see `specs/0001-product-1-core/team.md` for the 3-line format), then run `/plan` referencing `specs/0000-foundation/erd.md`.

This product reuses the parser, recommender, and pricing engines built in Product 1 (specs/0000-foundation/api-contracts.md) — it's the public-facing `/` Concierge surface.
