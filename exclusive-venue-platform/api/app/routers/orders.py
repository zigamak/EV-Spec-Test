"""Marketplace order intake + management (erd.md §6b, plan.md §3).

POST /orders is the widest-dependency write in this product: it finds-
or-creates a contact (same pattern webhooks.py already uses for inbound
email), prices the order off the vendor's service (or leaves it at 0
for a quote request), applies a coupon if given, and prices commission
off the currently-active ruleset — all via the admin client, since a
guest orderer has no session at all and orders' RLS deliberately has no
anon policy (0035's docstring: no Supabase Edge Function scaffolding in
this repo, same "plays the edge-function role" pattern public_proposals.py
and the Resend webhook already use).
"""

from datetime import date
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from postgrest.exceptions import APIError
from supabase import Client

from app.core.admin_client import get_admin_client
from app.core.auth import StaffUser, require_staff_session
from app.core.scoped_client import get_scoped_client
from app.schemas.order import Order, OrderCreate, OrderQuoteUpdate, OrderStatusUpdate
from app.services.commission_engine import find_active_commission_rule
from app.services.coupon_engine import CouponError, validate_and_apply_coupon

router = APIRouter(prefix="/orders", tags=["orders"])

ScopedClient = Annotated[Client, Depends(get_scoped_client)]
Caller = Annotated[StaffUser, Depends(require_staff_session)]


def _find_or_create_contact(admin: Client, full_name: str, email: str, phone: str | None) -> str:
    existing = admin.table("contacts").select("id").eq("email", email).limit(1).execute()
    if existing.data:
        return existing.data[0]["id"]
    created = (
        admin.table("contacts")
        .insert({"full_name": full_name, "email": email, "phone": phone, "source": "marketplace"})
        .execute()
    )
    return created.data[0]["id"]


@router.post("", response_model=Order, status_code=status.HTTP_201_CREATED)
def create_order(payload: OrderCreate):
    admin = get_admin_client()

    vendor_rows = admin.table("vendors").select("id, status").eq("id", str(payload.vendor_id)).execute()
    if not vendor_rows.data or vendor_rows.data[0]["status"] != "active":
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Vendor not found or not active")

    subtotal = 0.0
    if payload.vendor_service_id is not None:
        service_rows = (
            admin.table("vendor_services")
            .select("*")
            .eq("id", str(payload.vendor_service_id))
            .eq("vendor_id", str(payload.vendor_id))
            .execute()
        )
        if not service_rows.data:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Service not found for this vendor")
        service = service_rows.data[0]
        if service["pricing_type"] != "quote":
            subtotal = float(service["amount"])
        # else: quote-only service — subtotal stays 0, vendor prices it later.

    discount_amount = 0.0
    coupon_id = None
    if payload.coupon_code:
        try:
            coupon, discount_amount = validate_and_apply_coupon(
                admin, payload.coupon_code, str(payload.vendor_id), subtotal
            )
            coupon_id = coupon["id"]
        except CouponError as exc:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc

    total_amount = round(subtotal - discount_amount, 2)

    try:
        rule = find_active_commission_rule(admin, str(payload.vendor_id), date.today())
    except ValueError as exc:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, str(exc)) from exc
    commission_amount = round(
        total_amount * (rule["percentage_rate"] / 100) + rule["fixed_fee"], 2
    )
    commission_amount = min(commission_amount, total_amount)
    payout_amount = round(total_amount - commission_amount, 2)

    contact_id = _find_or_create_contact(admin, payload.full_name, payload.email, payload.phone)

    body = {
        "contact_id": contact_id,
        "customer_user_id": str(payload.customer_user_id) if payload.customer_user_id else None,
        "vendor_id": str(payload.vendor_id),
        "vendor_service_id": str(payload.vendor_service_id) if payload.vendor_service_id else None,
        "event_date": payload.event_date,
        "guest_count": payload.guest_count,
        "subtotal_amount": subtotal,
        "coupon_id": coupon_id,
        "discount_amount": discount_amount,
        "total_amount": total_amount,
        "currency": rule["currency"],
        "commission_rules_id": rule["id"],
        "commission_amount": commission_amount,
        "payout_amount": payout_amount,
    }
    result = admin.table("orders").insert(body).execute()
    return result.data[0]


@router.get("", response_model=list[Order])
def list_orders(client: ScopedClient, _: Caller):
    """RLS-scoped: staff sees everything, a vendor sees only their own
    orders (orders_vendor_select_own), a customer-role caller sees only
    orders tied to their own account (orders_customer_select_own)."""
    try:
        result = client.table("orders").select("*").order("created_at", desc=True).execute()
    except APIError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, exc.message) from exc
    return result.data


@router.get("/{order_id}", response_model=Order)
def get_order(order_id: UUID, client: ScopedClient, _: Caller):
    try:
        result = client.table("orders").select("*").eq("id", str(order_id)).execute()
    except APIError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, exc.message) from exc
    if not result.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Order not found")
    return result.data[0]


@router.patch("/{order_id}/quote", response_model=Order)
def set_order_quote(order_id: UUID, payload: OrderQuoteUpdate, client: ScopedClient, _: Caller):
    """A vendor pricing a quote-request order — RLS's orders_vendor_
    select_own doesn't grant UPDATE, only SELECT, so this endpoint checks
    ownership itself before recomputing totals server-side (never trusts
    a client-supplied total/commission)."""
    order_rows = client.table("orders").select("*").eq("id", str(order_id)).execute()
    if not order_rows.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Order not found")
    order = order_rows.data[0]

    admin = get_admin_client()
    rule_rows = (
        admin.table("commission_rules").select("*").eq("id", order["commission_rules_id"]).execute()
    )
    rule = rule_rows.data[0]

    total_amount = round(payload.subtotal_amount - order["discount_amount"], 2)
    commission_amount = min(
        round(total_amount * (rule["percentage_rate"] / 100) + rule["fixed_fee"], 2), total_amount
    )
    payout_amount = round(total_amount - commission_amount, 2)

    try:
        result = (
            client.table("orders")
            .update(
                {
                    "subtotal_amount": payload.subtotal_amount,
                    "total_amount": total_amount,
                    "commission_amount": commission_amount,
                    "payout_amount": payout_amount,
                }
            )
            .eq("id", str(order_id))
            .execute()
        )
    except APIError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, exc.message) from exc
    if not result.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Order not found or not writable")
    return result.data[0]


@router.patch("/{order_id}/status", response_model=Order)
def update_order_status(order_id: UUID, payload: OrderStatusUpdate, client: ScopedClient, _: Caller):
    try:
        result = (
            client.table("orders")
            .update({"status": payload.status})
            .eq("id", str(order_id))
            .execute()
        )
    except APIError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, exc.message) from exc
    if not result.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Order not found or not writable")
    return result.data[0]
