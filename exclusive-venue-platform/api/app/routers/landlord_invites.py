"""Landlord invite (task B2). Staff/admin only — calls Supabase Auth's
admin `inviteUserByEmail` server-side (the admin client's service-role
key never reaches the client) and writes a landlord_invites row to track
whether it converted.

Unlike every other write in this codebase, this one CANNOT rely on RLS
for role enforcement: inviting a user is an Auth Admin API call, not a
table INSERT, so there's no RLS policy standing between a non-staff
caller and this action. The has_role check below is therefore a real,
load-bearing app-layer check — not a redundant belt-and-suspenders one.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from postgrest.exceptions import APIError
from supabase import Client

from app.core.admin_client import get_admin_client
from app.core.auth import StaffUser, require_staff_session
from app.core.scoped_client import get_scoped_client
from app.schemas.landlord_invite import LandlordInvite, LandlordInviteCreate

router = APIRouter(prefix="/landlord-invites", tags=["landlord-invites"])

ScopedClient = Annotated[Client, Depends(get_scoped_client)]
Staff = Annotated[StaffUser, Depends(require_staff_session)]


def _require_staff_or_admin(client: Client, staff: StaffUser) -> None:
    try:
        roles = client.table("user_roles").select("role").eq("user_id", staff.user_id).execute()
    except APIError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, exc.message) from exc
    if not any(r["role"] in ("staff", "admin") for r in roles.data):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Staff or admin role required")


@router.post("", response_model=LandlordInvite, status_code=status.HTTP_201_CREATED)
def create_landlord_invite(payload: LandlordInviteCreate, client: ScopedClient, staff: Staff):
    _require_staff_or_admin(client, staff)

    # Supabase Auth admin call — untested live in this environment (no
    # Supabase credentials available), same caveat as every other
    # external-service call in this codebase (D1's GPT parser, G2's copy
    # generation). If the invite fails (already-registered email, Auth API
    # unreachable), surface it rather than silently writing a tracking row
    # for an invite that never actually sent.
    try:
        get_admin_client().auth.admin.invite_user_by_email(payload.email)
    except Exception as exc:
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY, f"Failed to send invite: {exc}"
        ) from exc

    try:
        result = (
            client.table("landlord_invites")
            .insert({"email": payload.email, "invited_by": staff.user_id})
            .execute()
        )
    except APIError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, exc.message) from exc
    return result.data[0]


@router.get("", response_model=list[LandlordInvite])
def list_landlord_invites(client: ScopedClient, staff: Staff):
    _require_staff_or_admin(client, staff)
    try:
        result = client.table("landlord_invites").select("*").order("invited_at", desc=True).execute()
    except APIError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, exc.message) from exc
    return result.data
