"""Vendor CRUD (erd.md §6, task per plan.md §3). Mirrors venues.py's
shape closely — same approval-before-live mechanic, same "RLS decides,
router just shapes requests" trust boundary. Every handler runs against
a Supabase client scoped to the caller's own JWT; a vendor calling this
only ever sees/writes their own row (0030's vendors_vendor_* policies).
"""

from datetime import UTC, datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from postgrest.exceptions import APIError
from supabase import Client

from app.core.admin_client import get_admin_client
from app.core.auth import StaffUser, require_staff_session
from app.core.scoped_client import get_scoped_client
from app.schemas.vendor import (
    Vendor,
    VendorCreate,
    VendorService,
    VendorServiceCreate,
    VendorServiceUpdate,
    VendorUpdate,
)

router = APIRouter(prefix="/vendors", tags=["vendors"])

ScopedClient = Annotated[Client, Depends(get_scoped_client)]
Caller = Annotated[StaffUser, Depends(require_staff_session)]


def _raise_for_postgrest(exc: APIError) -> None:
    code = str(exc.code or "").upper()
    if code in {"42501", "PGRST301"}:
        raise HTTPException(status.HTTP_403_FORBIDDEN, exc.message) from exc
    if code == "23505":
        raise HTTPException(status.HTTP_409_CONFLICT, "Already exists") from exc
    raise HTTPException(status.HTTP_400_BAD_REQUEST, exc.message) from exc


def _get_vendor_or_404(client: Client, vendor_id: UUID) -> dict:
    try:
        result = client.table("vendors").select("*").eq("id", str(vendor_id)).execute()
    except APIError as exc:
        _raise_for_postgrest(exc)
    if not result.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Vendor not found")
    return result.data[0]


@router.get("/directory", response_model=list[Vendor])
def public_vendor_directory(category: str | None = None, district: str | None = None):
    """Public marketplace directory — unauthenticated, no scoped client
    needed (0030's vendors_anon_select_active policy already limits a
    plain anon-key read to active+subscribed vendors, but this uses the
    admin client for the same reason currencies.py does: no per-request
    auth round-trip is worth paying for a public read)."""
    client = get_admin_client()
    query = (
        client.table("vendors")
        .select("*, vendor_subscriptions!inner(status)")
        .eq("status", "active")
        .eq("vendor_subscriptions.status", "active")
    )
    if category:
        query = query.eq("category", category)
    if district:
        query = query.eq("district", district)
    result = query.execute()
    return [{k: v for k, v in row.items() if k != "vendor_subscriptions"} for row in result.data]


@router.get("", response_model=list[Vendor])
def list_vendors(client: ScopedClient, _: Caller):
    """RLS-scoped: staff sees all, a vendor caller sees only their own row
    (vendors_vendor_select_own)."""
    try:
        result = client.table("vendors").select("*").execute()
    except APIError as exc:
        _raise_for_postgrest(exc)
    return result.data


@router.get("/{vendor_id}", response_model=Vendor)
def get_vendor(vendor_id: UUID, client: ScopedClient, _: Caller):
    return _get_vendor_or_404(client, vendor_id)


@router.post("", response_model=Vendor, status_code=status.HTTP_201_CREATED)
def create_vendor(payload: VendorCreate, client: ScopedClient, _: Caller):
    body = payload.model_dump(mode="json", exclude_none=True)
    try:
        result = client.table("vendors").insert(body).execute()
    except APIError as exc:
        _raise_for_postgrest(exc)
    return result.data[0]


@router.patch("/{vendor_id}", response_model=Vendor)
def update_vendor(vendor_id: UUID, payload: VendorUpdate, client: ScopedClient, _: Caller):
    body = payload.model_dump(mode="json", exclude_none=True)
    if not body:
        return _get_vendor_or_404(client, vendor_id)
    try:
        result = client.table("vendors").update(body).eq("id", str(vendor_id)).execute()
    except APIError as exc:
        _raise_for_postgrest(exc)
    if not result.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Vendor not found or not writable")
    return result.data[0]


@router.post("/{vendor_id}/approve", response_model=Vendor)
def approve_vendor(vendor_id: UUID, client: ScopedClient, staff: Caller):
    # Deliberately no vendor path here: vendors_vendor_update_own's WITH
    # CHECK only allows draft/pending_approval, so a vendor calling this
    # gets an RLS-empty result -> 404, never a silent self-activation
    # (same pattern as venues.py's approve_venue).
    body = {
        "status": "active",
        "approved_by": staff.user_id,
        "approved_at": datetime.now(UTC).isoformat(),
    }
    try:
        result = client.table("vendors").update(body).eq("id", str(vendor_id)).execute()
    except APIError as exc:
        _raise_for_postgrest(exc)
    if not result.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Vendor not found or not approvable")
    return result.data[0]


# --- vendor_services --------------------------------------------------


@router.get("/{vendor_id}/services", response_model=list[VendorService])
def list_vendor_services(vendor_id: UUID, client: ScopedClient, _: Caller):
    try:
        result = (
            client.table("vendor_services")
            .select("*")
            .eq("vendor_id", str(vendor_id))
            .order("sort_order")
            .execute()
        )
    except APIError as exc:
        _raise_for_postgrest(exc)
    return result.data


@router.get("/{vendor_id}/services/public", response_model=list[VendorService])
def list_vendor_services_public(vendor_id: UUID):
    """Public read for the vendor's own marketplace profile page —
    0031's vendor_services_anon_select policy already scopes this to
    active+subscribed vendors; admin client sidesteps the auth round-trip
    for the same reason the directory listing above does."""
    client = get_admin_client()
    result = (
        client.table("vendor_services")
        .select("*")
        .eq("vendor_id", str(vendor_id))
        .order("sort_order")
        .execute()
    )
    return result.data


@router.post(
    "/{vendor_id}/services", response_model=VendorService, status_code=status.HTTP_201_CREATED
)
def create_vendor_service(
    vendor_id: UUID, payload: VendorServiceCreate, client: ScopedClient, _: Caller
):
    body = {**payload.model_dump(mode="json", exclude_none=True), "vendor_id": str(vendor_id)}
    try:
        result = client.table("vendor_services").insert(body).execute()
    except APIError as exc:
        _raise_for_postgrest(exc)
    return result.data[0]


@router.patch("/{vendor_id}/services/{service_id}", response_model=VendorService)
def update_vendor_service(
    vendor_id: UUID,
    service_id: UUID,
    payload: VendorServiceUpdate,
    client: ScopedClient,
    _: Caller,
):
    body = payload.model_dump(mode="json", exclude_none=True)
    try:
        result = (
            client.table("vendor_services")
            .update(body)
            .eq("id", str(service_id))
            .eq("vendor_id", str(vendor_id))
            .execute()
        )
    except APIError as exc:
        _raise_for_postgrest(exc)
    if not result.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Service not found")
    return result.data[0]


@router.delete("/{vendor_id}/services/{service_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_vendor_service(vendor_id: UUID, service_id: UUID, client: ScopedClient, _: Caller):
    try:
        result = (
            client.table("vendor_services")
            .delete()
            .eq("id", str(service_id))
            .eq("vendor_id", str(vendor_id))
            .execute()
        )
    except APIError as exc:
        _raise_for_postgrest(exc)
    if not result.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Service not found")
