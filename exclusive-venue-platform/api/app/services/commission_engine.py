"""Deterministic commission calculation (erd.md §6b) — zero AI in this
call path, same trust boundary as pricing_engine.py. A vendor's
negotiated override takes precedence over the platform-wide default; the
lookup order and the calculation are split into two functions so the
calculation itself stays a pure function, unit-testable without a DB.
"""

from datetime import date as date_type
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    # Deferred so calculate_commission (the pure half, unit-tested without
    # a DB) stays importable in environments without the supabase package
    # installed — same reasoning as every other "not verified live" note
    # in this product.
    from supabase import Client


def find_active_commission_rule(client: "Client", vendor_id: str, on_date: date_type) -> dict[str, Any]:
    """Vendor-specific override if one is active on `on_date`, else the
    platform-wide default (vendor_id IS NULL). Raises if neither exists —
    the 0033 seed migration guarantees a default row always exists, so
    this should only fire if that row was later deleted."""
    on_date_iso = on_date.isoformat()

    vendor_rows = (
        client.table("commission_rules")
        .select("*")
        .eq("vendor_id", vendor_id)
        .lte("effective_from", on_date_iso)
        .order("effective_from", desc=True)
        .execute()
        .data
    )
    for row in vendor_rows:
        if row["effective_to"] is None or on_date_iso <= row["effective_to"]:
            return row

    default_rows = (
        client.table("commission_rules")
        .select("*")
        .is_("vendor_id", "null")
        .lte("effective_from", on_date_iso)
        .order("effective_from", desc=True)
        .execute()
        .data
    )
    for row in default_rows:
        if row["effective_to"] is None or on_date_iso <= row["effective_to"]:
            return row

    raise ValueError("No active commission rule found (platform default missing)")


def calculate_commission(subtotal_after_discount: float, rule: dict[str, Any]) -> tuple[float, float]:
    """Returns (commission_amount, payout_amount). Percentage + fixed fee,
    matching Stripe's own combined-fee model, per direct instruction."""
    commission = round(subtotal_after_discount * (rule["percentage_rate"] / 100) + rule["fixed_fee"], 2)
    commission = min(commission, subtotal_after_discount)  # never exceeds the order total
    payout = round(subtotal_after_discount - commission, 2)
    return commission, payout
