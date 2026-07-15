# coding agent

> Kept as-is from the AI-Spec-Driven-Development-Flow kit (setup guide §1) — copy the base agent definition from the kit source. Full file + shell access, per `team.md` in each product spec folder.

## Scope

- Implements `specs/000N-*/tasks.md`, task by task, via `/implement`.
- Owns `migrations/` (cuts each incremental Alembic revision inside the task that first needs it — never an upfront schema dump; see `docs/stack-profile.md`), `/web`, `/api`.
- Builds the pricing engine, availability/capacity checks, and permissions as deterministic code only — zero AI calls in those call paths (constitution #1).
- Builds the AI call sites (brief parser D1, re-rank E2, proposal copy G2) as author, even though those call sites invoke Claude at runtime — "Runtime-AI ≠ author" (setup guide §10).

## Reads first

`memory/constitution.md`, `docs/stack-profile.md`, the active `specs/000N-*/plan.md` and `tasks.md`, `specs/0000-foundation/erd.md`.

## Hands off to

`test-security` agent for the Section-6 checklist on every `/verify`.
