"""Landlord payout account — manual only, self-service (task C2).
Stripe Connect explicitly deferred (erd.md §6a); the landlord enters their
own bank details directly, staff verifies manually outside the app.

RLS (0027_landlord_payment_accounts.py) already scopes reads/writes to the
owning landlord or staff — but staff browsing another landlord's account
still needs the number masked in the response, which RLS can't express
(it's a column-value transform, not a row filter), so that happens here.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from postgrest.exceptions import APIError
from supabase import Client

from app.core.auth import StaffUser, require_staff_session
from app.core.scoped_client import get_scoped_client
from app.schemas.landlord_payment_account import (
    LandlordPaymentAccount,
    LandlordPaymentAccountUpsert,
    mask_account_number,
)

router = APIRouter(prefix="/landlord/payment-account", tags=["landlord-payment-accounts"])

ScopedClient = Annotated[Client, Depends(get_scoped_client)]
Landlord = Annotated[StaffUser, Depends(require_staff_session)]


@router.get("", response_model=LandlordPaymentAccount | None)
def get_own_payment_account(client: ScopedClient, landlord: Landlord):
    """Always the caller's own record — RLS (landlord_payment_accounts_
    landlord_own) guarantees this, so no masking here: a landlord always
    sees their own full account number on their own edit form."""
    try:
        result = (
            client.table("landlord_payment_accounts")
            .select("*")
            .eq("landlord_id", landlord.user_id)
            .execute()
        )
    except APIError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, exc.message) from exc
    return result.data[0] if result.data else None


@router.put("", response_model=LandlordPaymentAccount)
def upsert_own_payment_account(
    payload: LandlordPaymentAccountUpsert, client: ScopedClient, landlord: Landlord
):
    body = {**payload.model_dump(exclude_none=True), "landlord_id": landlord.user_id}
    try:
        result = (
            client.table("landlord_payment_accounts")
            .upsert(body, on_conflict="landlord_id")
            .execute()
        )
    except APIError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, exc.message) from exc
    return result.data[0]


@router.get("/{landlord_id}", response_model=LandlordPaymentAccount)
def get_landlord_payment_account_staff(landlord_id: str, client: ScopedClient, staff: Landlord):
    """Staff view of a specific landlord's account — masked, per erd.md
    §6a ("masked display anywhere except the landlord's own edit form").
    RLS's staff_all policy grants the read; masking happens here since
    it's a value transform, not a row-visibility rule."""
    try:
        result = (
            client.table("landlord_payment_accounts")
            .select("*")
            .eq("landlord_id", landlord_id)
            .execute()
        )
    except APIError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, exc.message) from exc
    if not result.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No payment account on file")
    return mask_account_number(result.data[0])
