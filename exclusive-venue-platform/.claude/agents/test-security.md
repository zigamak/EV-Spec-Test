# test-security agent

> Kept as-is from the AI-Spec-Driven-Development-Flow kit (setup guide §1) — copy the base agent definition from the kit source. Writes tests only; does not implement features. The checklist below is appended per setup guide §6 and is project-specific.

## Scope

- Writes tests only (Vitest for web, pytest for api). Never implements application code.
- Runs the Project-Specific Verification Checklist below on every `/verify`, in addition to the base kit's standard checks.
- CI (`.github/workflows/ci.yml`) runs the same suite this agent writes — one test truth, no separate `/verify`-only suite.

## Project-Specific Verification Checklist (run on every /verify)

- [x] RLS: landlord role can read/write ONLY own venues (test cross-tenant denial)
      — verified live 16 Jul: two throwaway landlord accounts, landlord A
      blocked (403/404) from spoofing B's landlord_id, reading/updating/
      deleting B's venue, and self-activating their own venue.
- [ ] RLS: supplier role scoped to own profile/subscription only
      — N/A yet: Product 4 (supplier marketplace) tables don't exist in
      this repo's schema yet (Week 6 per erd.md §10). Re-check once built.
- [x] RLS: staff role cannot be assumed by public/anon key
      — verified live 16 Jul: anon (publishable key, no session) gets 0
      rows on every staff-only table (organisations/contacts/enquiries/
      briefs/pricing_rules/pricing_rule_addons/proposals/proposal_venues/
      proposal_link_tokens/user_roles/profiles) and sees only status=
      'active' venues. Every staff API endpoint correctly 401s with no
      token, a garbage token, or the publishable key used as a bearer token.
- [ ] Public Concierge endpoint: rate limiting active, Turnstile present
      — N/A yet: the public Concierge page is Product 2, not yet built
      (also gated behind the Tier-2 design acceptance regardless).
- [ ] Concierge form: privacy/consent notice rendered (PDPO)
      — N/A yet, same as above.
- [x] No secrets in repo (scan for keys); .env* gitignored
      — verified live 16 Jul: grepped all tracked files for Supabase/
      OpenAI/Resend key patterns and DB connection strings with embedded
      passwords — every match was doc prose referencing the *naming
      convention* (`sb_publishable_...`), not an actual key. No `.env*`
      files tracked.
- [x] Pricing engine: zero AI/LLM calls anywhere in its call path
      — verified live 16 Jul: `pricing_engine.py`'s only imports are
      `datetime` and its own Pydantic schemas; grepped the module + its
      router for any openai/anthropic reference — none.
- [x] Golden set green; pricing unit tests vs historical quotes green
      — 49 passed / 1 skipped (golden set skips cleanly without a live
      `OPENAI_API_KEY`, doesn't fail); 17 pricing-engine unit tests green
      (synthetic scenarios — real historical quotes still pending the
      client's pricing-spreadsheet conversion, a Sprint Board human task).
- [ ] Stripe webhooks (product 4): signature verification present
      — N/A yet: Product 4 (supplier marketplace/Stripe billing) isn't
      built in this repo yet.

*Source: SDD Repo Setup Guide — Exclusive Venue §6 (Notion).*
