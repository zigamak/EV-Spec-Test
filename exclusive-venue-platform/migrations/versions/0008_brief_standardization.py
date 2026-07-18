"""Standardize the brief contract + WhatsApp channel + client tier/rate
card + locked proposal date

Revision ID: 0008
Revises: 0007
Create Date: 2026-07-18

Task D5 (new — see specs/0001-product-1-core/tasks.md), decided 18 Jul
after live-browsing the reference prototype's actual Concierge briefing UI
(exclusive-venue-internal-ai-sales.netlify.app — a real Dior enquiry, "9
fields, 1 flagged", client tier + rate-card context, a date *window* with
suggested alternates, budget shown as "TBC" with an AI-estimated range,
mood, and per-field confirmation flags). None of that was representable in
the 0004 briefs shape, which only had a single event_date + a flexible
boolean and one scalar budget_amount.

The point of this revision: **one standardized brief contract that the AI
parser targets regardless of the enquiry's channel** (email, WhatsApp, a
manual note, or the public web form). `enquiries.channel` gains
'whatsapp' as a first-class value so that's not a free-text guess either.
The public web form path (C2, not yet built) is a special case worth
noting here: it fills these same columns *directly and deterministically*
(no AI parse of free text needed — the client already answered
structured questions), landing at confidence=1.0 / review_status=
'human_approved' rather than going through app/services/brief_parser.py
at all. See erd.md §5.1 for the write-up.

Schema changes (all ALTER — 0003/0004/0006 stay untouched, per constitution
rule #8):

  enquiries.channel / contacts.source  — add 'whatsapp'
  organisations                        — tier, rate_card_on_file,
                                          rate_card_terms, region
  briefs                               — event_date renamed to
                                          date_window_start; new
                                          date_window_end, date_suggestions,
                                          time_of_day, budget_status,
                                          budget_estimate_low/high,
                                          flagged_fields, fields_to_confirm.
                                          requirements stays a free-form
                                          jsonb column (unchanged type) but
                                          now has a documented conventional
                                          shape — see erd.md §5.1 — rather
                                          than being genuinely arbitrary.
  proposals                            — event_date (the *locked* date,
                                          decided in the generate-and-share
                                          step, distinct from the brief's
                                          date_window_*), personal_email_copy
                                          (the AI-drafted note that
                                          accompanies a sent proposal — a
                                          separate artifact from
                                          intro_copy, confirmed as a real
                                          feature on the reference site,
                                          not a backlog guess).
"""

from alembic import op

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def _replace_check(table: str, column: str, constraint_name: str, new_check_sql: str) -> None:
    """Swap an inline column CHECK for a wider one, by name. Postgres
    auto-names an inline `CHECK (col IN (...))` on column `col` as
    `<table>_<col>_check` (verified live for enquiries_channel_check), which
    is exactly the name we re-add under — so DROP ... IF EXISTS on that name
    is deterministic. (A text match on pg_get_constraintdef would miss it:
    Postgres stores `IN (...)` as `= ANY (ARRAY[...])`, so an '%IN%' pattern
    never matches — the bug that stalled 0007's first live run.)"""
    op.execute(f"ALTER TABLE {table} DROP CONSTRAINT IF EXISTS {constraint_name}")
    op.execute(f"ALTER TABLE {table} ADD CONSTRAINT {constraint_name} CHECK ({new_check_sql})")


def upgrade() -> None:
    # --- 1. WhatsApp as a first-class channel/source -----------------------
    _replace_check(
        "enquiries", "channel", "enquiries_channel_check",
        "channel IN ('email', 'web_form', 'manual', 'concierge', 'whatsapp')",
    )
    _replace_check(
        "contacts", "source", "contacts_source_check",
        "source IN ('email', 'web_form', 'concierge', 'manual', 'whatsapp')",
    )

    # --- 2. Client tier / rate card (organisations) -------------------------
    op.execute(
        """
        ALTER TABLE organisations
        ADD COLUMN tier TEXT CHECK (tier IN ('tier-1', 'tier-2', 'standard')),
        ADD COLUMN rate_card_on_file BOOLEAN NOT NULL DEFAULT false,
        ADD COLUMN rate_card_terms TEXT,
        ADD COLUMN region TEXT
        """
    )

    # --- 3. Standardized brief contract (briefs) -----------------------------
    # 3a. event_date -> date_window_start (rename preserves existing data),
    #     then a matching window end, backfilled from the same value so no
    #     existing row is left with a half-open window.
    op.execute("ALTER TABLE briefs RENAME COLUMN event_date TO date_window_start")
    op.execute("ALTER TABLE briefs ADD COLUMN date_window_end DATE")
    op.execute("UPDATE briefs SET date_window_end = date_window_start WHERE date_window_start IS NOT NULL")
    op.execute(
        """
        ALTER TABLE briefs
        ADD CONSTRAINT briefs_date_window_order_check
        CHECK (
            date_window_start IS NULL OR date_window_end IS NULL
            OR date_window_end >= date_window_start
        )
        """
    )
    # event_date_flexible's meaning shifts with it: previously "is the
    # single event_date flexible", now "is the exact date within the
    # window still unconfirmed with the client" — same column, repointed
    # semantics, no rename needed.

    # 3b. AI-suggested candidate dates when the window isn't yet narrowed
    #     to one day (e.g. "suggest Sat 28 Jun or Sat 5 Jul").
    op.execute("ALTER TABLE briefs ADD COLUMN date_suggestions JSONB NOT NULL DEFAULT '[]'::jsonb")

    # 3c. Time-of-day, alongside the existing duration_hours.
    op.execute(
        """
        ALTER TABLE briefs
        ADD COLUMN time_of_day TEXT
        CHECK (time_of_day IS NULL OR time_of_day IN ('morning', 'afternoon', 'evening', 'full_day'))
        """
    )

    # 3d. Budget: keep budget_amount/budget_basis as the *confirmed* figure
    #     (0004's CHECK linking them stays exactly as-is), add a status so
    #     "TBC" is a real state instead of indistinguishable from "not
    #     asked yet", plus an AI-estimated range for when it's TBC.
    op.execute(
        """
        ALTER TABLE briefs
        ADD COLUMN budget_status TEXT NOT NULL DEFAULT 'unspecified'
            CHECK (budget_status IN ('confirmed', 'tbc', 'unspecified')),
        ADD COLUMN budget_estimate_low NUMERIC(12, 2),
        ADD COLUMN budget_estimate_high NUMERIC(12, 2)
        """
    )
    op.execute(
        """
        UPDATE briefs SET budget_status = 'confirmed' WHERE budget_amount IS NOT NULL
        """
    )
    op.execute(
        """
        ALTER TABLE briefs
        ADD CONSTRAINT briefs_budget_estimate_range_check
        CHECK (
            (budget_estimate_low IS NULL AND budget_estimate_high IS NULL)
            OR (
                budget_estimate_low IS NOT NULL AND budget_estimate_high IS NOT NULL
                AND budget_estimate_high >= budget_estimate_low
            )
        )
        """
    )

    # 3e. Per-field review granularity — "96% confidence, 1 field flagged"
    #     is meaningless at the API layer today since `confidence` is a
    #     single scalar for the whole brief. These name *which* fields.
    op.execute(
        """
        ALTER TABLE briefs
        ADD COLUMN flagged_fields JSONB NOT NULL DEFAULT '[]'::jsonb,
        ADD COLUMN fields_to_confirm JSONB NOT NULL DEFAULT '[]'::jsonb
        """
    )

    # requirements stays untouched (already jsonb, already NOT NULL DEFAULT
    # '{}') — it now has a documented conventional shape
    # ({"format_needs": [...], "tech_needs": [...], "mood": [...],
    # "attachments": [...]}) enforced in app code (ParsedBrief/BriefUpdate),
    # the same "jsonb + code-level validation" pattern pricing_rules already
    # uses (erd.md §4) — not a DB-level shape constraint, since it's
    # deliberately still extensible per-enquiry.

    # --- 4. Locked date + personal email on the sent proposal ---------------
    op.execute(
        """
        ALTER TABLE proposals
        ADD COLUMN event_date DATE,
        ADD COLUMN personal_email_copy TEXT
        """
    )


def downgrade() -> None:
    op.execute("ALTER TABLE proposals DROP COLUMN IF EXISTS personal_email_copy")
    op.execute("ALTER TABLE proposals DROP COLUMN IF EXISTS event_date")

    op.execute("ALTER TABLE briefs DROP COLUMN IF EXISTS fields_to_confirm")
    op.execute("ALTER TABLE briefs DROP COLUMN IF EXISTS flagged_fields")
    op.execute("ALTER TABLE briefs DROP CONSTRAINT IF EXISTS briefs_budget_estimate_range_check")
    op.execute("ALTER TABLE briefs DROP COLUMN IF EXISTS budget_estimate_high")
    op.execute("ALTER TABLE briefs DROP COLUMN IF EXISTS budget_estimate_low")
    op.execute("ALTER TABLE briefs DROP COLUMN IF EXISTS budget_status")
    op.execute("ALTER TABLE briefs DROP COLUMN IF EXISTS time_of_day")
    op.execute("ALTER TABLE briefs DROP COLUMN IF EXISTS date_suggestions")
    op.execute("ALTER TABLE briefs DROP CONSTRAINT IF EXISTS briefs_date_window_order_check")
    op.execute("ALTER TABLE briefs DROP COLUMN IF EXISTS date_window_end")
    op.execute("ALTER TABLE briefs RENAME COLUMN date_window_start TO event_date")

    op.execute("ALTER TABLE organisations DROP COLUMN IF EXISTS region")
    op.execute("ALTER TABLE organisations DROP COLUMN IF EXISTS rate_card_terms")
    op.execute("ALTER TABLE organisations DROP COLUMN IF EXISTS rate_card_on_file")
    op.execute("ALTER TABLE organisations DROP COLUMN IF EXISTS tier")

    _replace_check(
        "contacts", "source", "contacts_source_check",
        "source IN ('email', 'web_form', 'concierge', 'manual')",
    )
    _replace_check(
        "enquiries", "channel", "enquiries_channel_check",
        "channel IN ('email', 'web_form', 'manual', 'concierge')",
    )
