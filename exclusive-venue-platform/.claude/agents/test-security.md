# test-security agent

> Kept as-is from the AI-Spec-Driven-Development-Flow kit (setup guide §1) — copy the base agent definition from the kit source. Writes tests only; does not implement features. The checklist below is appended per setup guide §6 and is project-specific.

## Scope

- Writes tests only (Vitest for web, pytest for api). Never implements application code.
- Runs the Project-Specific Verification Checklist below on every `/verify`, in addition to the base kit's standard checks.
- CI (`.github/workflows/ci.yml`) runs the same suite this agent writes — one test truth, no separate `/verify`-only suite.

## Project-Specific Verification Checklist (run on every /verify)

- [ ] RLS: landlord role can read/write ONLY own venues (test cross-tenant denial)
- [ ] RLS: supplier role scoped to own profile/subscription only
- [ ] RLS: staff role cannot be assumed by public/anon key
- [ ] Public Concierge endpoint: rate limiting active, Turnstile present
- [ ] Concierge form: privacy/consent notice rendered (PDPO)
- [ ] No secrets in repo (scan for keys); .env* gitignored
- [ ] Pricing engine: zero AI/LLM calls anywhere in its call path
- [ ] Golden set green; pricing unit tests vs historical quotes green
- [ ] Stripe webhooks (product 4): signature verification present

*Source: SDD Repo Setup Guide — Exclusive Venue §6 (Notion).*
