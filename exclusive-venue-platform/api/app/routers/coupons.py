"""Coupon management (erd.md §6b). Vendors create/manage their own
vendor-scoped coupons (0034's coupons_vendor_insert_own/select_own); staff
manage platform-wide codes. No GET-by-code/list endpoint for anon at
all — validation happens through /coupons/validate, which never returns
the full coupons table, only whether one code applies and by how much
(rls-matrix.md hard line #1, extended to coupons alongside pricing_rules).
"""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from postgrest.exceptions import APIError
from pydantic import BaseModel
from supabase import Client

from app.core.admin_client import get_admin_client
from app.core.auth import StaffUser, require_staff_session
from app.core.scoped_client import get_scoped_client
from app.schemas.coupon import Coupon, CouponCreate
from app.services.coupon_engine import CouponError, validate_and_apply_coupon

router = APIRouter(prefix="/coupons", tags=["coupons"])

ScopedClient = Annotated[Client, Depends(get_scoped_client)]
Caller = Annotated[StaffUser, Depends(require_staff_session)]


class CouponValidateRequest(BaseModel):
    code: str
    vendor_id: UUID
    subtotal: float


class CouponValidateResponse(BaseModel):
    valid: bool
    discount_amount: float = 0
    message: str | None = None


@router.get("", response_model=list[Coupon])
def list_own_coupons(client: ScopedClient, _: Caller):
    """RLS-scoped: staff sees everything, a vendor caller sees only their
    own vendor-scoped coupons (never platform-wide ones, never another
    vendor's)."""
    try:
        result = client.table("coupons").select("*").execute()
    except APIError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, exc.message) from exc
    return result.data


@router.post("", response_model=Coupon, status_code=status.HTTP_201_CREATED)
def create_coupon(payload: CouponCreate, client: ScopedClient, caller: Caller):
    body = {**payload.model_dump(mode="json", exclude_none=True), "created_by": caller.user_id}
    try:
        result = client.table("coupons").insert(body).execute()
    except APIError as exc:
        code = str(exc.code or "").upper()
        if code in {"42501", "PGRST301"}:
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                "Can only create a coupon for your own vendor listing (or, as staff, a platform-wide one)",
            ) from exc
        raise HTTPException(status.HTTP_400_BAD_REQUEST, exc.message) from exc
    return result.data[0]


@router.post("/validate", response_model=CouponValidateResponse)
def validate_coupon(payload: CouponValidateRequest):
    """The "RPC" erd.md §6b describes — the only sanctioned way to check a
    coupon, called at checkout. Uses the admin client since the caller at
    checkout time may be a guest with no session at all."""
    client = get_admin_client()
    try:
        _coupon, discount = validate_and_apply_coupon(
            client, payload.code, str(payload.vendor_id), payload.subtotal
        )
    except CouponError as exc:
        return CouponValidateResponse(valid=False, message=str(exc))
    return CouponValidateResponse(valid=True, discount_amount=discount)
