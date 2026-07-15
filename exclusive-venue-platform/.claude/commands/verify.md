# /verify

Kept as-is from the kit — copy the base command definition from the kit source.

**Purpose:** runs the same suite as `.github/workflows/ci.yml` (one test truth — setup guide §1) plus the `test-security` agent's project checklist (setup guide §6), then checks the result against `specs/000N-*/verification.md` acceptance criteria. A task is only done when this passes (constitution #6).
