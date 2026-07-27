"""Vendor payout records (erd.md §6b, plan.md §3). Staff-only creation +
mark-paid — the actual money movement (manual bank transfer, or a Stripe
Connect automatic split) happens outside this endpoint; this just
records that it happened, same "one authoritative record instead of
scattered emails" principle as landlord_payment_accounts.
"""

from datetime import UTC, datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from postgrest.exceptions import APIError
from supabase import Client

from app.core.auth import StaffUser, require_staff_session
from app.core.scoped_client import get_scoped_client
from app.schemas.payout import Payout, PayoutCreate

router = APIRouter(prefix="/payouts", tags=["payouts"])

ScopedClient = Annotated[Client, Depends(get_scoped_client)]
Caller = Annotated[StaffUser, Depends(require_staff_session)]


def _require_staff_or_admin(client: Client, caller: StaffUser) -> None:
    try:
        roles = client.table("user_roles").select("role").eq("user_id", caller.user_id).execute()
    except APIError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, exc.message) from exc
    if not any(r["role"] in ("staff", "admin") for r in roles.data):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Staff or admin role required")


@router.get("", response_model=list[Payout])
def list_payouts(client: ScopedClient, _: Caller):
    """RLS-scoped: staff sees everything, a vendor sees only their own
    payouts (payouts_vendor_select_own)."""
    try:
        result = client.table("payouts").select("*").order("created_at", desc=True).execute()
    except APIError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, exc.message) from exc
    return result.data


@router.post("", response_model=Payout, status_code=status.HTTP_201_CREATED)
def create_payout(payload: PayoutCreate, client: ScopedClient, caller: Caller):
    _require_staff_or_admin(client, caller)

    order_rows = client.table("orders").select("*").eq("id", str(payload.order_id)).execute()
    if not order_rows.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Order not found")
    order = order_rows.data[0]

    account_rows = (
        client.table("vendor_payment_accounts")
        .select("payout_method")
        .eq("vendor_id", order["vendor_id"])
        .execute()
    )
    method = account_rows.data[0]["payout_method"] if account_rows.data else "manual"

    body = {
        "vendor_id": order["vendor_id"],
        "order_id": str(payload.order_id),
        "gross_amount": order["total_amount"],
        "commission_amount": order["commission_amount"],
        "net_amount": order["payout_amount"],
        "currency": order["currency"],
        "method": method,
    }
    try:
        result = client.table("payouts").insert(body).execute()
    except APIError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, exc.message) from exc
    return result.data[0]


@router.post("/{payout_id}/mark-paid", response_model=Payout)
def mark_payout_paid(payout_id: UUID, client: ScopedClient, caller: Caller):
    _require_staff_or_admin(client, caller)
    try:
        result = (
            client.table("payouts")
            .update(
                {"status": "paid", "paid_at": datetime.now(UTC).isoformat(), "paid_by": caller.user_id}
            )
            .eq("id", str(payout_id))
            .execute()
        )
    except APIError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, exc.message) from exc
    if not result.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Payout not found")
    return result.data[0]
