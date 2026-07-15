# Stack Profile — Exclusive Venue Platform

## Stack
- Frontend: Next.js (App Router, TypeScript strict) — single app, 4 UI surfaces
  via role-based routing: / (public Concierge), /app/* (staff), /landlord/*,
  /supplier/* + public supplier directory
- Backend: FastAPI (Python 3.12) — AI orchestration + pricing engine
- DB/Auth/Storage: Supabase (Postgres + RLS, Auth, Storage buckets)
- Migrations: Alembic (SQLAlchemy Core, no ORM models required) against the
  Supabase Postgres connection string. Lives at repo root: `alembic.ini` +
  `migrations/env.py` + `migrations/versions/`.
- Deploy: Render Web Services ×2 (web, api). Staging + production.
- AI: OpenAI API (gpt-4o-mini). Email: Resend (inbound parse + outbound). Payments: Stripe (HK).

## Conventions
- TypeScript strict; Python type hints + ruff
- Tests: Vitest (web), pytest (api). Pricing engine: unit tests against real
  historical quotes. Parser: golden set in fixtures/anonymized/.
- Commits: conventional (feat:/fix:/chore:), small and task-scoped

## Migration conventions (Alembic)
- **Incremental, task-scoped.** Tables are created in the revision belonging
  to the task that first needs them — never one upfront migration for the
  whole schema. `specs/0000-foundation/erd.md` is the canonical target-state
  design; the `migrations/versions/` history is how the DB actually gets
  there, one slice at a time. See erd.md §10 for the revision-to-task map.
- **RLS ships with its table.** Each revision that creates a table includes
  the RLS policies for that table in the same revision — not a separate
  upfront "RLS task." A table with no RLS policy is never merged.
- **Revisions are immutable once merged to main.** A schema change after that
  point — new column, changed CHECK constraint, new enum value — is a new
  revision (`alembic revision -m "..."`) that ALTERs, never a hand-edit of an
  old revision file. History must replay cleanly on a fresh DB.
- **CI runs `alembic upgrade head` against a clean test DB before the test
  suite** (see §6/I1) — a revision that doesn't apply cleanly is a failed
  /verify, same as a failing test.
- Prefer hand-written revisions over `--autogenerate` for anything touching
  RLS, CHECK constraints, or jsonb columns — autogenerate handles plain
  columns/tables fine but won't infer policy or constraint intent correctly.

## Branch strategy
- Branch per spec folder: feat/0001-product-1-core
- /verify must pass before merge to main
- main auto-deploys to Render staging; production deploys by manual tag

## Non-negotiables (mirror of constitution)
- Pricing, availability, permissions: deterministic code ONLY. Never AI-derived.
- Deterministic filters run BEFORE any AI re-ranking. AI never invents availability.
- Real client data never committed — see fixtures/README.md.
