# /design-system

Kept from the kit, **amended** for the project's two-tier provisional/accepted gate (setup guide §1, §5).

**Purpose:** ingests the client brand kit (dropped into `design-system/dropzone/`) and generates `design-system/tokens.css` + `design-system/components.md`. On success, flips `design-system/INTAKE.md` Tier 2 "Accepted:" from `no` to `yes`.

**Amendment:** before the brand kit lands, this command is NOT required to unblock work — Tier 1 provisional tokens (`design-system/tokens.provisional.css`) already authorize internal/admin surfaces. Only client-facing surfaces (proposal template, public Concierge, public vendor directory) are gated on this command actually running successfully. See `design-system/INTAKE.md`.
