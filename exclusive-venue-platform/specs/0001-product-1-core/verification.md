# Verification — Product 1: Internal Platform (Core)

*Pasted near-verbatim from Notion PRD — Product 1, §7 Acceptance Criteria (setup guide §3.3 mapping). `/verify` checks task work against this file, plus the CI suite (`.github/workflows/ci.yml`) and the security checklist (`.claude/agents/test-security.md`).*

The milestone (M1) is met when all of the following hold:

- Given a real enquiry email, the brief parser produces a correct structured brief, or flags it for human review when confidence is low — verified against the golden test set of 15–20 real enquiries.
- Given the same inputs as a historical quote, the pricing engine reproduces the client's own past quote (within rounding). Verified by unit tests built from real past quotes.
- The recommendation engine never returns a venue that fails a hard constraint (over capacity, unavailable, restricted).
- A salesperson can generate a branded proposal as both a PDF and a working shareable link.
- An enquiry can be moved through every pipeline stage and assigned to a salesperson.
- **The end-to-end flow (raw enquiry → sent proposal) is completed in under 20 minutes by two pilot salespeople on real enquiries, without using Excel.**

## Maps to tasks.md

- Parser criterion → D1–D4, I1 (golden set in CI)
- Pricing criterion → F1–F3, I1
- Recommendation criterion → E1
- Proposal PDF/link criterion → G1–G5 (blocked on Tier-2 design gate)
- Pipeline stage/assignment criterion → C1, H1–H2
- 20-minute pilot criterion → I2 (E2E happy path), I3 (final `/verify` vs this file) — the pilot test itself is a human task tracked on the Sprint Board, not in tasks.md (setup guide §7 filter rule)
