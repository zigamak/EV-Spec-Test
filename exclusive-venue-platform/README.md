## README.md — what this repo is + quickstart

# Exclusive Venue Platform

Spec-driven development repo for the Pentanitive × Exclusive Venue build: 4 products, 8 weeks (Jul 13 – Sep 6, 2026), ~190 hours, built on Render + Supabase with Next.js + FastAPI.

This repo follows the "spec before code" discipline: every feature starts as a spec under `specs/`, moves through the `/plan` → `/tasks` → `/implement` → `/verify` → `/track` pipeline (see `.claude/commands/`), and nothing ships without passing `/verify` against `verification.md` acceptance criteria and the CI suite in `.github/workflows/ci.yml`.

## Quickstart

1. Read `CLAUDE.md` for the operating manual (pipeline, agents, rules, truth hierarchy).
2. Read `docs/stack-profile.md` for the stack, conventions, and migration rules — every agent reads this first.
3. Read `memory/constitution.md` for the non-negotiable project rules (AI-vs-deterministic boundary, scope, budget, data handling, truth hierarchy).
4. Product specs live under `specs/000N-*/`. Shared/cross-product artifacts (schema, API contracts, routing, RLS) live once in `specs/0000-foundation/` — product folders reference them, never redefine them.
5. Run the pipeline commands in `.claude/commands/` in order: `/constitution` → `/design-system` → `/plan` → `/tasks` → `/implement` → `/verify` → `/track`. Do **not** run `/discover` or `/specify` generatively — the Notion PRDs are pasted into `specs/*/prd.md` directly; regenerating them burns hours re-deriving decisions already made.

## Running the dev servers

- **API** (`api/`): `uvicorn app.main:app --reload --port 8000` from `api/`, with the repo-root `.venv` active and `api/.env` sourced. Always port **8000** — `web/.env.local`'s `NEXT_PUBLIC_API_URL` points there. Run exactly one instance; leave it running in its own terminal rather than starting a new one per edit.
- **Web** (`web/`): `npm run dev` from `web/`. Always port **3000**.
- If `--reload` seems to be serving stale code after several rapid edits across multiple files (WatchFiles' debounce can occasionally miss a burst), stop the server (Ctrl+C) and restart the same command — don't start a second instance on a different port. Two servers on different ports both claiming to be "the" API is how you end up debugging phantom state.

## Structure

- `specs/0000-foundation/` — cross-product schema (`erd.md`), RLS matrix, route architecture, shared API contracts.
- `specs/0001-product-1-core/` — Product 1: Internal Platform (Core). Populated first; build window Weeks 1–5.
- `specs/0002-ai-concierge/`, `specs/0003-landlord-portal/`, `specs/0004-vendor-marketplace/` — populated the week before their build starts (Weeks 5–6), same order as the Sprint Board.
- `migrations/` — incremental Alembic revisions, one per task that first needs a table. Never a single upfront migration. See `docs/stack-profile.md`.
- `fixtures/` — golden test set. `raw/` is gitignored (real client data, HK PDPO); `anonymized/` is committed.
- `design-system/` — two-tier token gate (`INTAKE.md`): provisional tokens unblock internal UI now; accepted tokens (from the client brand kit) gate client-facing surfaces.

## Truth hierarchy

Notion Sprint Board is PM/schedule truth. `specs/*/tasks.md` is the coding agent's working snapshot. `docs/progress.md` and `CHANGELOG.md` are run logs. On conflict, the Sprint Board wins — see `CLAUDE.md` §Truth Hierarchy and the SDD Repo Setup Guide §7.

Full setup rationale and decomposition: see the "SDD Repo Setup Guide — Exclusive Venue" doc in Notion.
