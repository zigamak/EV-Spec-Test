# Constitution — Exclusive Venue Platform

1. TRUST BOUNDARY. AI (GPT) handles: brief parsing, venue re-ranking,
   proposal copy. Deterministic code handles: pricing, availability, capacity,
   permissions, billing. No exceptions. AI output is a suggestion a human can
   review; deterministic output is authoritative.
2. SCOPE. Phase 2 (task mgmt, newsletters, analytics dashboards, contract
   tracking) is OUT of this build. If a task drifts toward it, stop and flag.
3. BUDGET. ~190 hours total across 8 weeks. Prefer the simplest implementation
   that passes verification. No gold-plating; polish items go to the backlog.
4. DATA. Real client enquiries/personal data never enter git history.
   Anonymize per fixtures/README.md before committing test data.
5. QUALITY BAR. Client-facing surfaces (proposal template, Concierge) meet
   luxury-brand polish and require the accepted design system. Internal/admin
   surfaces may ship on provisional tokens.
6. VERIFICATION. A task is done only when /verify passes: CI suite green,
   golden set green, acceptance criteria in verification.md satisfied.
7. TRUTH HIERARCHY. Notion Sprint Board = PM/schedule truth. specs/*/tasks.md =
   the coding agent's working snapshot. progress.md = run log. On conflict,
   Sprint Board wins; resync weekly.
8. SCHEMA CHANGES. Tables are created incrementally via Alembic, scoped to the
   task that first needs them — never all upfront. RLS policies ship in the
   same revision as the table they protect. Once a revision is merged it is
   immutable; further changes (new columns, altered constraints) are new
   revisions, never edits to migration history. erd.md is the target-state
   design; migrations/versions/ is how the DB actually gets there.
