"""Vendor payout account — manual or Stripe Connect, per-vendor setting
(task per plan.md §3). Structurally identical to
app/routers/landlord_payment_accounts.py; reuses its mask_account_number
helper rather than duplicating the masking logic.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from postgrest.exceptions import APIError
from supabase import Client

from app.core.auth import StaffUser, require_staff_session
from app.core.scoped_client import get_scoped_client
from app.schemas.landlord_payment_account import mask_account_number
from app.schemas.vendor_payment_account import VendorPaymentAccount, VendorPaymentAccountUpsert

router = APIRouter(prefix="/vendor/payment-account", tags=["vendor-payment-accounts"])

ScopedClient = Annotated[Client, Depends(get_scoped_client)]
Vendor = Annotated[StaffUser, Depends(require_staff_session)]


@router.get("", response_model=VendorPaymentAccount | None)
def get_own_payment_account(client: ScopedClient, vendor: Vendor):
    try:
        result = (
            client.table("vendor_payment_accounts")
            .select("*")
            .eq("vendor_id", vendor.user_id)
            .execute()
        )
    except APIError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, exc.message) from exc
    return result.data[0] if result.data else None


@router.put("", response_model=VendorPaymentAccount)
def upsert_own_payment_account(
    payload: VendorPaymentAccountUpsert, client: ScopedClient, vendor: Vendor
):
    body = {**payload.model_dump(exclude_none=True), "vendor_id": vendor.user_id}
    try:
        result = (
            client.table("vendor_payment_accounts")
            .upsert(body, on_conflict="vendor_id")
            .execute()
        )
    except APIError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, exc.message) from exc
    return result.data[0]


@router.get("/{vendor_id}", response_model=VendorPaymentAccount)
def get_vendor_payment_account_staff(vendor_id: str, client: ScopedClient, staff: Vendor):
    try:
        result = (
            client.table("vendor_payment_accounts")
            .select("*")
            .eq("vendor_id", vendor_id)
            .execute()
        )
    except APIError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, exc.message) from exc
    if not result.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No payment account on file")
    return mask_account_number(result.data[0])
