# CLAUDE.md — Operating Manual

*Exclusive Venue Platform — adapted from the AI-Spec-Driven-Development-Flow kit per the "SDD Repo Setup Guide — Exclusive Venue" (Notion, Approved).*

## Pipeline

Run the slash commands in `.claude/commands/` in this order, once the repo is seeded (see setup guide §2):

1. `/constitution` — validates `memory/constitution.md`.
2. `/design-system` — ingests the brand kit when it lands; amended for the two-tier gate (see `design-system/INTAKE.md`).
3. `/plan` — per product, only after that product's schema needs are reflected in `specs/0000-foundation/erd.md`. Output reviewed, not hand-written, into `specs/000N-*/plan.md`.
4. `/tasks` — seeds/updates `specs/000N-*/tasks.md`. Product 1 seed lives at Section 8 of the setup guide, copied into `specs/0001-product-1-core/tasks.md`.
5. `/implement` → `/verify` → `/track` — run task by task. `/verify` runs the same suite as CI (`.github/workflows/ci.yml`) — one test truth.

**Do NOT** run `/discover` or `/specify` generatively. Paste the Notion PRDs into `specs/*/prd.md` instead — regenerating burns hours rediscovering decisions already made.

## Agents (`.claude/agents/`)

Three role-locked agents, kept as-is from the kit because they structurally enforce the AI-vs-deterministic boundary:

- `design.md` — design system / UI work.
- `coding.md` — implements `tasks.md`, full file + shell access.
- `test-security.md` — writes tests only; runs the project security checklist (setup guide §6) on every `/verify`.

## Non-negotiable rules (mirrors `memory/constitution.md`)

1. **Trust boundary.** AI (Claude) handles brief parsing, venue re-ranking, proposal copy — always a suggestion a human can review. Deterministic code handles pricing, availability, capacity, permissions, billing — always authoritative. No exceptions.
2. **Scope.** Phase 2 (task mgmt, newsletters, analytics, contract tracking) is out of this build. If a task drifts toward it, stop and flag.
3. **Budget.** ~190 hours across 8 weeks. Simplest implementation that passes verification; polish goes to backlog.
4. **Data.** Real client enquiries/personal data never enter git history (HK PDPO). See `fixtures/README.md`.
5. **Quality bar.** Client-facing surfaces need the accepted design system (Tier 2). Internal/admin surfaces may ship on provisional tokens (Tier 1). See `design-system/INTAKE.md`.
6. **Verification.** A task is done only when `/verify` passes: CI suite green, golden set green, `verification.md` acceptance criteria satisfied.
7. **Schema changes.** Tables are created incrementally via Alembic, scoped to the task that first needs them. RLS ships in the same revision as its table. Merged revisions are immutable — further changes are new revisions. `erd.md` is the target-state design; `migrations/versions/` is the real history.

## Truth hierarchy (the drift killer)

| Surface | Role | Updated |
|---|---|---|
| **Notion Sprint Board** | PM/schedule TRUTH | You, weekly (or as tasks close) |
| `specs/*/tasks.md` | Coding agent's working snapshot for the active week | Agent during `/implement` |
| `docs/progress.md` | Run log (what happened each session) | Agent via `/track` |
| `CHANGELOG.md` | Git-native change ledger | Agent via `/track` |

Sync ritual, weekly (~10 min): read `progress.md` + `tasks.md` checkmarks → update Sprint Board statuses → decompose next week's Sprint Board rows into `tasks.md`. **On conflict, Sprint Board wins.**

Filter rule: non-engineering rows (Write PRD, Resolve Concierge decisions, Pilot test with salespeople) never enter `tasks.md`. They live in the Sprint Board only.

## Git workflow (every commit)

Before committing anything, ALWAYS:

1. **Sync `main` first.** `git checkout main` → `git fetch origin` → `git pull` (fast-forward). This catches any updates pushed elsewhere (other machine, teammate, Claude Desktop session) before you branch, so you never build on a stale base.
2. **Never commit straight to `main`.** Create a temporary feature branch off the freshly-pulled `main`: `git checkout -b feat/<short-topic>` (or `fix/…`). Do the commit(s) there.
3. **Push the branch** (`git push -u origin <branch>`) and open a PR for `main` — don't push commits directly onto `main`.
4. Note: the git repo root is the **parent** `EV-Spec-Test/` folder, not `exclusive-venue-platform/`. `git add -A` will sweep in siblings like `ui-ux-pro-max-skill/` — stage deliberately (it's gitignored now) and confirm `api/.env` is never staged (it holds live secrets).

## Reference

Full rationale, the target repo structure, and the failure-mode table this setup is designed against: "SDD Repo Setup Guide — Exclusive Venue" in Notion (Design System & Product Docs). Pairs with the Sprint Board, the four PRDs, and the client Requirements Gathering document.
