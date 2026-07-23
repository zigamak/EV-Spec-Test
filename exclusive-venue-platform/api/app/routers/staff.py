"""Staff identity + directory (workflow overhaul — role-based access).

`/me` is informational only — the frontend uses it to decide which UI to
render (e.g. hide the salesperson pill row for a non-admin, since RLS
already guarantees they only ever get their own rows back). It never
enforces anything; Postgres RLS does that (migration 0022). `/staff` is
the "who can I assign this to" directory, replacing the hardcoded TEAM
array in web/lib/team.ts per that file's own long-standing comment that
it should become a live fetch once real staff logins exist.
"""

from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, status
from postgrest.exceptions import APIError
from pydantic import BaseModel
from supabase import Client

from app.core.auth import StaffUser, require_staff_session
from app.core.scoped_client import get_scoped_client

router = APIRouter(tags=["staff"])

ScopedClient = Annotated[Client, Depends(get_scoped_client)]
Staff = Annotated[StaffUser, Depends(require_staff_session)]


def _raise_for_postgrest(exc: APIError) -> None:
    code = (exc.code or "").upper()
    if code in {"42501", "PGRST301"}:
        raise HTTPException(status.HTTP_403_FORBIDDEN, exc.message) from exc
    raise HTTPException(status.HTTP_400_BAD_REQUEST, exc.message) from exc


class Me(BaseModel):
    user_id: str
    email: str | None
    role: Literal["admin", "staff"]
    full_name: str | None


class StaffMember(BaseModel):
    user_id: str
    full_name: str


@router.get("/me", response_model=Me)
def get_me(client: ScopedClient, staff: Staff):
    # user_roles_select_own + profiles_staff_all (both already grant this
    # caller read access to their own row) — no admin client needed.
    try:
        roles = client.table("user_roles").select("role").eq("user_id", staff.user_id).execute()
    except APIError as exc:
        _raise_for_postgrest(exc)
    role: Literal["admin", "staff"] = (
        "admin" if any(r["role"] == "admin" for r in roles.data) else "staff"
    )

    try:
        profile = client.table("profiles").select("full_name").eq("id", staff.user_id).execute()
    except APIError as exc:
        _raise_for_postgrest(exc)
    full_name = profile.data[0]["full_name"] if profile.data else None

    return Me(user_id=staff.user_id, email=staff.email, role=role, full_name=full_name)


@router.get("/staff", response_model=list[StaffMember])
def list_staff(client: ScopedClient, _: Staff):
    """The assignable roster — every user_id holding 'staff' but NOT also
    'admin', plus their profile name. Admins aren't assignment targets,
    they're the ones doing the assigning — excluded even if (like the dev
    test@user.com account) they also hold a leftover 'staff' row."""
    try:
        roles = client.table("user_roles").select("user_id, role").in_("role", ["staff", "admin"]).execute()
    except APIError as exc:
        _raise_for_postgrest(exc)
    admin_ids = {r["user_id"] for r in roles.data if r["role"] == "admin"}
    staff_ids = list({r["user_id"] for r in roles.data if r["role"] == "staff"} - admin_ids)
    if not staff_ids:
        return []

    try:
        profiles = client.table("profiles").select("id, full_name").in_("id", staff_ids).execute()
    except APIError as exc:
        _raise_for_postgrest(exc)
    return [
        StaffMember(user_id=p["id"], full_name=p["full_name"])
        for p in profiles.data
        if p.get("full_name")
    ]
