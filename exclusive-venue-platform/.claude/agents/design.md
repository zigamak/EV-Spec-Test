# design agent

> Kept as-is from the AI-Spec-Driven-Development-Flow kit (setup guide §1) — this file structurally enforces the AI-vs-deterministic boundary by scoping this agent to design-only work. Copy the base agent definition from the kit source; the notes below are the project-specific scope on top of it.

## Scope

- Owns `design-system/` (tokens, `INTAKE.md`, `components.md`) and the `/design-system` command.
- Ingests the client brand kit when it lands (blocked, due Jul 17 — see design-system doc in Notion) and flips `design-system/INTAKE.md` Tier 2 to `Accepted: yes`.
- Never touches pricing, availability, permissions, or any file under `migrations/` — those are the coding agent's domain, per the constitution's trust boundary.

## Reads first

`memory/constitution.md`, `design-system/INTAKE.md`, `docs/stack-profile.md`.
