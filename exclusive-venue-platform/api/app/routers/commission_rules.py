"""Commission ruleset CRUD (erd.md §6b). Staff manage the platform
default and any vendor override; a vendor gets read-only access to their
own override + the default (0033's commission_rules_vendor_select_own_or_
default policy) — never another vendor's negotiated rate.
"""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from postgrest.exceptions import APIError
from supabase import Client

from app.core.auth import StaffUser, require_staff_session
from app.core.scoped_client import get_scoped_client
from app.schemas.commission_rule import CommissionRule, CommissionRuleCreate

router = APIRouter(prefix="/commission-rules", tags=["commission-rules"])

ScopedClient = Annotated[Client, Depends(get_scoped_client)]
Caller = Annotated[StaffUser, Depends(require_staff_session)]


def _require_staff_or_admin(client: Client, caller: StaffUser) -> None:
    try:
        roles = client.table("user_roles").select("role").eq("user_id", caller.user_id).execute()
    except APIError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, exc.message) from exc
    if not any(r["role"] in ("staff", "admin") for r in roles.data):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Staff or admin role required")


@router.get("", response_model=list[CommissionRule])
def list_commission_rules(client: ScopedClient, _: Caller, vendor_id: UUID | None = None):
    """RLS auto-scopes: a vendor caller only ever sees the platform
    default plus their own override, never another vendor's rate."""
    query = client.table("commission_rules").select("*")
    if vendor_id is not None:
        query = query.eq("vendor_id", str(vendor_id))
    try:
        result = query.order("effective_from", desc=True).execute()
    except APIError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, exc.message) from exc
    return result.data


@router.post("", response_model=CommissionRule, status_code=status.HTTP_201_CREATED)
def create_commission_rule(payload: CommissionRuleCreate, client: ScopedClient, caller: Caller):
    """Staff only — a per-vendor override or (rarely) a new platform
    default. Commission is platform economics, not vendor-facing pricing
    a vendor is being asked to trust, so this is a direct staff write, not
    a propose/approve workflow like Product 3's pricing_rule_change_
    requests (plan.md §7 flagged this as an open question; resolved here
    in favor of the simpler direct-edit path)."""
    _require_staff_or_admin(client, caller)
    body = payload.model_dump(mode="json", exclude_none=True)
    try:
        result = client.table("commission_rules").insert(body).execute()
    except APIError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, exc.message) from exc
    return result.data[0]
