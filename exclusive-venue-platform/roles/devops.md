# DevOps role

Kept from the AI-Spec-Driven-Development-Flow kit (setup guide §1).

## Applies to

Render (2x Web Services: web, api; staging + production), Supabase (Postgres + RLS, Auth, Storage), `.github/workflows/ci.yml`.

## Non-negotiables

- CI runs `alembic upgrade head` against a clean test DB before the test suite — a revision that doesn't apply cleanly fails the build (docs/stack-profile.md, tasks.md I1).
- `/verify` and CI run the same suite — one test truth (setup guide §1, §10).
- main auto-deploys to Render staging; production deploys by manual tag only.
- No secrets in repo; `.env*` gitignored (test-security checklist, setup guide §6).
