# Backend role

Kept from the AI-Spec-Driven-Development-Flow kit (setup guide §1 — only backend/frontend/devops are kept; data-engineer/scientist/analyst/ml roles are removed as unused on this build).

## Applies to

FastAPI (Python 3.12) services: AI orchestration (brief parser, re-rank, proposal copy generation), pricing engine, Alembic migrations, RLS policies, Stripe webhooks (product 4), Resend inbound webhook.

## Non-negotiables

- Pricing, availability, capacity, permissions: deterministic code only, zero AI calls in the call path (constitution #1).
- Every table-creating change ships as an incremental Alembic revision with its RLS policy in the same revision (docs/stack-profile.md).
- Type hints + ruff; pytest for all engine logic, unit-tested against real historical quotes where applicable (pricing).
